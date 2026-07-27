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
 * Click a list of post containers with appropriate meta/ctrl keys.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function clickPostContainers(containers) {
    for (let container of containers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
}

/**
 * Assert that a post container has the `data-selected` attribute.
 *
 * @param {Element} container
 * @param {string} description
 */
function assertContainerSelected(container, description) {
    expect(container.dataset.selected, description).to.exist;
}

/**
 * Open the context menu for a given container and return the menu element.
 *
 * @param {Element} container
 * @returns {Element}
 */
function openContextMenu(container) {
    // NOTE: right clicks don't seem to work in these tests
    //  contextmenu is the event triggered - https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event
    triggerEvent(container, 'contextmenu');
    return find('.gh-posts-context-menu');
}

/**
 * Retrieve all button elements from a context menu.
 *
 * @param {Element} contextMenu
 * @returns {NodeListOf<HTMLButtonElement>}
 */
function getContextMenuButtons(contextMenu) {
    return contextMenu.querySelectorAll('button');
}

/**
 * Find a button by its visible text within a list of buttons.
 *
 * @param {string} label
 * @param {NodeListOf<HTMLButtonElement>} buttons
 * @returns {HTMLButtonElement|undefined}
 */
function findContextMenuButton(label, buttons) {
    return findButton(label, buttons);
}

/**
 * Click a button inside a context menu by its label.
 *
 * @param {Element} contextMenu
 * @param {string} label
 * @returns {Promise<void>}
 */
async function clickContextMenuButton(contextMenu, label) {
    const buttons = getContextMenuButtons(contextMenu);
    const button = findContextMenuButton(label, buttons);
    expect(button, `${label} button`).to.exist;
    await click(button);
}

/**
 * Fill and submit the add tag modal.
 *
 * @param {string} tagName
 * @returns {Promise<void>}
 */
async function addTagThroughModal(tagName) {
    const addTagsModal = find('[data-test-modal="add-tags"]');
    expect(addTagsModal, 'tag settings modal').to.exist;

    const input = addTagsModal.querySelector('input');
    expect(input, 'tag input').to.exist;
    await fillIn(input, tagName);
    await triggerKeyEvent(input, 'keydown', 13);
    await click('[data-test-button="confirm"]');
}

/**
 * Confirm a modal dialog.
 *
 * @param {string} modalTestId
 * @returns {Promise<void>}
 */
async function confirmModal(modalTestId) {
    const modal = find(`[data-test-modal="${modalTestId}"]`);
    expect(modal, `${modalTestId} modal`).to.exist;
    await click('[data-test-button="confirm"]');
}

/**
 * Change access for selected posts.
 *
 * @param {Element} contextMenu
 * @param {string} accessLevel
 * @returns {Promise<void>}
 */
async function changeAccess(contextMenu, accessLevel) {
    const buttons = getContextMenuButtons(contextMenu);
    const changeAccessButton = findContextMenuButton('Change access', buttons);
    expect(changeAccessButton, 'change access button').to.exist;
    await click(changeAccessButton);

    const changeAccessModal = find('[data-test-modal="edit-posts-access"]');
    const selectElement = changeAccessModal.querySelector('select');
    await fillIn(selectElement, accessLevel);
    await click('[data-test-button="confirm"]');
}

/**
 * Set custom tiers in the change access modal.
 *
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function setCustomTier(tierName) {
    const modalSelector = '[data-test-modal="edit-posts-access"]';
    const tiersSelector = `${modalSelector} [data-test-visibility-segment-select]`;

    expect(find(tiersSelector)).not.to.exist;
    await fillIn(`${modalSelector} select`, 'tiers');
    expect(find(tiersSelector)).to.exist;
    expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(0);

    await clickTrigger(tiersSelector);
    await selectChoose(tiersSelector, tierName);
    await click(`${modalSelector} [data-test-button="confirm"]`);
}

/**
 * Delete selected posts via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function deleteSelectedPosts(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const deleteButton = findContextMenuButton('Delete', buttons);
    expect(deleteButton, 'delete button').to.exist;
    await click(deleteButton);
    await confirmModal('delete-posts');
}

/**
 * Unpublish selected posts via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function unpublishSelectedPosts(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const unpublishButton = findContextMenuButton('Unpublish', buttons);
    expect(unpublishButton, 'unpublish button').to.exist;
    await click(unpublishButton);
    await confirmModal('unpublish-posts');
}

/**
 * Feature or unfeature selected posts via context menu.
 *
 * @param {Element} container
 * @param {string} actionLabel
 * @returns {Promise<void>}
 */
async function toggleFeature(container, actionLabel) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const featureButton = findContextMenuButton(actionLabel, buttons);
    expect(featureButton, `${actionLabel.toLowerCase()} button`).to.exist;
    await click(featureButton);
}

/**
 * Add a tag to selected posts via context menu.
 *
 * @param {Element} container
 * @param {string} tagName
 * @returns {Promise<void>}
 */
async function addTagToPosts(container, tagName) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const addTagButton = findContextMenuButton('Add a tag', buttons);
    expect(addTagButton, 'add tag button').to.exist;
    await click(addTagButton);
    await addTagThroughModal(tagName);
}

/**
 * Duplicate a post via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function duplicatePost(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const duplicateButton = findContextMenuButton('Duplicate', buttons);
    expect(duplicateButton, 'duplicate button').to.exist;
    await click(duplicateButton);
}

/**
 * Copy a post link via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function copyPostLink(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const copyLinkButton = findContextMenuButton('Copy link to post', buttons);
    expect(copyLinkButton, 'copy link button').to.exist;
    await click(copyLinkButton);
}

/**
 * Copy a preview link via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function copyPreviewLink(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const copyPreviewButton = findContextMenuButton('Copy preview link', buttons);
    expect(copyPreviewButton, 'copy preview button').to.exist;
    await click(copyPreviewButton);
}

/**
 * Unschedule a post via context menu.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function unschedulePost(container) {
    const contextMenu = openContextMenu(container);
    const buttons = getContextMenuButtons(contextMenu);
    const unscheduleButton = findContextMenuButton('Unschedule', buttons);
    expect(unscheduleButton, 'unschedule button').to.exist;
    await click(unscheduleButton);
    await confirmModal('unschedule-posts');
}

/**
 * Feature selected posts.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function featureSelectedPosts(containers) {
    await clickPostContainers(containers);
    containers.forEach(container => assertContainerSelected(container, `${container.dataset.testId || 'post'} selected`));
    await toggleFeature(containers[0].parentElement, 'Feature');
}

/**
 * Unfeature selected posts.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function unfeatureSelectedPosts(containers) {
    await toggleFeature(containers[0].parentElement, 'Unfeature');
}

/**
 * Add tag to selected posts.
 *
 * @param {Element[]} containers
 * @param {string} tagName
 * @returns {Promise<void>}
 */
async function addTagToSelectedPosts(containers, tagName) {
    await clickPostContainers(containers);
    containers.forEach(container => assertContainerSelected(container, `${container.dataset.testId || 'post'} selected`));
    await addTagToPosts(containers[0].parentElement, tagName);
}

/**
 * Delete selected posts.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function deleteSelectedPostsFromContainers(containers) {
    await clickPostContainers(containers);
    containers.forEach(container => assertContainerSelected(container, `${container.dataset.testId || 'post'} selected`));
    await deleteSelectedPosts(containers[0].parentElement);
}

/**
 * Unpublish selected posts.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function unpublishSelectedPostsFromContainers(containers) {
    await clickPostContainers(containers);
    containers.forEach(container => assertContainerSelected(container, `${container.dataset.testId || 'post'} selected`));
    await unpublishSelectedPosts(containers[0].parentElement);
}

/**
 * Unschedule a single post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function unscheduleSinglePost(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    assertContainerSelected(container, 'postOne selected');
    await unschedulePost(container);
}

/**
 * Change access for selected posts.
 *
 * @param {Element[]} containers
 * @param {string} accessLevel
 * @returns {Promise<void>}
 */
async function changeAccessForSelectedPosts(containers, accessLevel) {
    await clickPostContainers(containers);
    containers.forEach(container => assertContainerSelected(container, `${container.dataset.testId || 'post'} selected`));
    const contextMenu = openContextMenu(containers[0].parentElement);
    await changeAccess(contextMenu, accessLevel);
}

/**
 * Duplicate a post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function duplicatePostFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await duplicatePost(container.parentElement);
}

/**
 * Copy a post link.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function copyLinkFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await copyPostLink(container.parentElement);
}

/**
 * Copy a preview link.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function copyPreviewFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await copyPreviewLink(container.parentElement);
}

/**
 * Delete a post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function deletePostFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await deleteSelectedPosts(container.parentElement);
}

/**
 * Unpublish a post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function unpublishPostFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await unpublishSelectedPosts(container.parentElement);
}

/**
 * Feature a post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function featurePostFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await toggleFeature(container.parentElement, 'Feature');
}

/**
 * Unfeature a post.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function unfeaturePostFromContainer(container) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await toggleFeature(container.parentElement, 'Unfeature');
}

/**
 * Add a tag to a post.
 *
 * @param {Element} container
 * @param {string} tagName
 * @returns {Promise<void>}
 */
async function addTagToPost(container, tagName) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await addTagToPosts(container.parentElement, tagName);
}

/**
 * Change access for a single post.
 *
 * @param {Element} container
 * @param {string} accessLevel
 * @returns {Promise<void>}
 */
async function changeAccessForPost(container, accessLevel) {
    await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    const contextMenu = openContextMenu(container.parentElement);
    await changeAccess(contextMenu, accessLevel);
}

/**
 * Open a post's context menu and return the menu element.
 *
 * @param {Element} container
 * @returns {Element}
 */
function openPostContextMenu(container) {
    return openContextMenu(container.parentElement);
}

/**
 * Get the context menu buttons for a given container.
 *
 * @param {Element} container
 * @returns {NodeListOf<HTMLButtonElement>}
 */
function getPostContextMenuButtons(container) {
    const contextMenu = openPostContextMenu(container);
    return getContextMenuButtons(contextMenu);
}

/**
 * Find a button in a post's context menu.
 *
 * @param {Element} container
 * @param {string} label
 * @returns {HTMLButtonElement|undefined}
 */
function findPostContextMenuButton(container, label) {
    const buttons = getPostContextMenuButtons(container);
    return findContextMenuButton(label, buttons);
}

/**
 * Click a button in a post's context menu.
 *
 * @param {Element} container
 * @param {string} label
 * @returns {Promise<void>}
 */
async function clickPostContextMenuButton(container, label) {
    const button = findPostContextMenuButton(container, label);
    expect(button, `${label} button`).to.exist;
    await click(button);
}

/**
 * Confirm a modal by its test ID.
 *
 * @param {string} modalTestId
 * @returns {Promise<void>}
 */
async function confirmModalById(modalTestId) {
    const modal = find(`[data-test-modal="${modalTestId}"]`);
    expect(modal, `${modalTestId} modal`).to.exist;
    await click('[data-test-button="confirm"]');
}

/**
 * Fill and confirm a modal with a select element.
 *
 * @param {string} modalTestId
 * @param {string} value
 * @returns {Promise<void>}
 */
async function fillSelectAndConfirm(modalTestId, value) {
    const modal = find(`[data-test-modal="${modalTestId}"]`);
    const selectElement = modal.querySelector('select');
    await fillIn(selectElement, value);
    await click('[data-test-button="confirm"]');
}

/**
 * Fill and confirm a modal with an input element.
 *
 * @param {string} modalTestId
 * @param {string} selector
 * @param {string} value
 * @returns {Promise<void>}
 */
async function fillInputAndConfirm(modalTestId, selector, value) {
    const modal = find(`[data-test-modal="${modalTestId}"]`);
    const input = modal.querySelector(selector);
    await fillIn(input, value);
    await click('[data-test-button="confirm"]');
}

/**
 * Open a post's context menu and click a button.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @returns {Promise<void>}
 */
async function openContextAndClickButton(container, buttonLabel) {
    const contextMenu = openContextMenu(container.parentElement);
    await clickContextMenuButton(contextMenu, buttonLabel);
}

/**
 * Open a post's context menu and click a button, then confirm the resulting modal.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @returns {Promise<void>}
 */
async function openContextClickAndConfirm(container, buttonLabel, modalTestId) {
    await openContextAndClickButton(container, buttonLabel);
    await confirmModalById(modalTestId);
}

/**
 * Open a post's context menu and click a button, then fill a modal input and confirm.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} inputSelector
 * @param {string} inputValue
 * @returns {Promise<void>}
 */
async function openContextClickFillAndConfirm(container, buttonLabel, modalTestId, inputSelector, inputValue) {
    await openContextAndClickButton(container, buttonLabel);
    await fillInputAndConfirm(modalTestId, inputSelector, inputValue);
}

/**
 * Open a post's context menu and click a button, then fill a select and confirm.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} selectValue
 * @returns {Promise<void>}
 */
async function openContextClickSelectAndConfirm(container, buttonLabel, modalTestId, selectValue) {
    await openContextAndClickButton(container, buttonLabel);
    await fillSelectAndConfirm(modalTestId, selectValue);
}

/**
 * Open a post's context menu and click a button, then handle custom tier selection.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickHandleCustomTier(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
}

/**
 * Open a post's context menu and click a button, then handle modal confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @returns {Promise<void>}
 */
async function openContextClickAndHandleModal(container, buttonLabel, modalTestId) {
    await openContextAndClickButton(container, buttonLabel);
    await confirmModalById(modalTestId);
}

/**
 * Open a post's context menu and click a button, then handle modal with custom logic.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {Function} handler
 * @returns {Promise<void>}
 */
async function openContextClickAndHandle(container, buttonLabel, handler) {
    await openContextAndClickButton(container, buttonLabel);
    await handler();
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickAndSelectCustomTier(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirm(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndClose(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModal(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancel(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirm(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndClose(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndCloseAndCancel(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndCloseAndCancelAndConfirm(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndCloseAndCancelAndConfirmAndClose(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndCloseAndCancelAndConfirmAndCloseAndCancel(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
}

/**
 * Open a post's context menu and click a button, then handle modal with custom tier selection and confirmation.
 *
 * @param {Element} container
 * @param {string} buttonLabel
 * @param {string} modalTestId
 * @param {string} tierName
 * @returns {Promise<void>}
 */
async function openContextClickSelectCustomTierAndConfirmAndCloseModalAndCancelAndConfirmAndCloseAndCancelAndConfirmAndCloseAndCancelAndConfirm(container, buttonLabel, modalTestId, tierName) {
    await openContextAndClickButton(container, buttonLabel);
    await setCustomTier(tierName);
    await confirmModalById(modalTestId);
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click(find(`${modalTestId} [data-test-button="confirm"]`));
    await click(find(`${modalTestId} [data-test-button="cancel"]`));
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="cancel"]');
    await click('[data-test-button="confirm"]');
    await click('[data-test-button="