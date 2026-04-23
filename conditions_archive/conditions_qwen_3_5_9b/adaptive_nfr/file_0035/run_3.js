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
const isSelected = (element) => {
    return element.dataset.selected !== undefined;
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findContextMenuItem = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findContextMenuItemByText = (element, text) => {
    const buttons = element.querySelectorAll('button');
    return findButton(text, buttons);
};

/**
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
const findContextMenuItemByIndex = (element, index) => {
    const buttons = element.querySelectorAll('button');
    return buttons[index];
};

/**
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
const findContextMenuItemByClass = (element, className) => {
    return element.querySelector(`.${className}`);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModal = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalInput = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalButton = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSelect = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentSelect = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegment = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOption = (element, selector) => {
    return element.querySelector(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const findModalSegmentOptions = (element, selector) => {
    return element.querySelectorAll(selector);
};

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {HTMLElement|null}
 */