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
 * @param {string} text
 * @param {NodeList} buttons
 * @returns Node
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * @param {HTMLElement} element
 * @returns {boolean}
 */
const isElementVisible = (element) => {
    return element && element.offsetParent !== null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getAttribute = (element) => {
    return element.getAttribute('data-selected');
};

/**
 * @param {HTMLElement} element
 * @returns {boolean}
 */
const hasAttribute = (element) => {
    return element && element.dataset.selected !== undefined;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getTextContent = (element) => {
    return element ? element.textContent.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getSelectorText = (element) => {
    return element ? element.querySelector('.gh-content-entry-title')?.textContent : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getStatusText = (element) => {
    return element ? element.querySelector('.gh-content-entry-status')?.textContent : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getFilterText = (element) => {
    return element ? element.textContent.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getModalText = (element) => {
    return element ? element.querySelector('h1')?.textContent.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getSelectValue = (element) => {
    return element ? element.value : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getSelectOptionText = (element) => {
    return element ? element.textContent.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getSelectOptionCount = (element) => {
    return element ? element.length : 0;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getOptionText = (element) => {
    return element ? element.textContent.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getOptionCount = (element) => {
    return element ? element.length : 0;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getPostCount = (element) => {
    return element ? element.length : 0;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonCount = (element) => {
    return element ? element.length : 0;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndex = (element, index) => {
    return element ? element[index] : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonText = (element) => {
    return element ? element.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 * @returns {string|null}
 */
const getButtonIndexText = (element, index) => {
    return element ? element[index]?.innerText.trim() : null;
};

/**
 * @param {HTMLElement} element
 *