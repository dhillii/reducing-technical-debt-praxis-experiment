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
 * Finds a button by text content
 * @param {string} text
 * @param {NodeList} buttons
 * @returns {Node}
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Verifies post list is empty
 * @param {Object} context - Test context
 */
const verifyEmptyPostList = (context) => {
    expect(findAll('[data-test-post-id]')).to.have.length(0);
    expect(find('[data-test-no-posts-box]')).to.exist;
    expect(find('[data-test-link="write-a-new-post"]')).to.exist;
};

/**
 * Creates a new post and verifies it appears in list
 * @param {Object} context - Test context
 */
const createAndVerifyPost = async (context) => {
    await click('[data-test-link="write-a-new-post"]');
    expect(currentURL()).to.equal('/editor/post');

    await fillIn('[data-test-editor-title-input]', 'First contributor post');
    await blur('[data-test-editor-title-input]');

    expect(currentURL()).to.equal('/editor/post/1');

    await click('[data-test-link="posts"]');

    expect(findAll('[data-test-post-id]')).to.have.length(1);
    expect(find('[data-test-no-posts-box]')).to.not.exist;
};

/**
 * Verifies context menu is not visible
 * @param {Node} post - Post element
 */
const verifyContextMenuNotVisible = async (post) => {
    await triggerEvent(post, 'contextmenu');
    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.not.be.visible;
};

/**
 * Verifies posts are displayed in correct order
 * @param {Array} posts - Post elements
 */
const verifyPostOrder = (posts) => {
    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
    expect(posts[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
    expect(posts[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
    expect(posts[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');
};

/**
 * Verifies API requests for post filtering
 * @param {Object} context - Test context
 */
const verifyPostFilterRequests = (context) => {
    let lastRequests = context.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
    expect(lastRequests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
    expect(lastRequests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
    expect(lastRequests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
};

/**
 * Filters posts by status and verifies results
 * @param {Object} context - Test context
 * @param {string} filterText - Filter option text
 * @param {string} expectedFilter - Expected filter string
 * @param {number} expectedCount - Expected post count
 */
const filterPostsByStatus = async (context, filterText, expectedFilter, expectedCount) => {
    await selectChoose('[data-test-type-select]', filterText);

    let postsRequests = context.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    let lastPostsRequest = postsRequests[postsRequests.length - 1];
    expect(lastPostsRequest.queryParams.filter, `"${filterText}" request status filter`).to.have.string(expectedFilter);
    expect(findAll('[data-test-post-id]').length, `${filterText} count`).to.equal(expectedCount);
};

/**
 * Verifies context menu buttons for editor
 * @param {Node} contextMenu - Context menu element
 */
const verifyEditorContextMenuButtons = (contextMenu) => {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(5);
    expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
    expect(buttons[1].innerText.trim(), 'context menu button 2').to.contain('Unpublish');
    expect(buttons[2].innerText.trim(), 'context menu button 3').to.contain('Feature');
    expect(buttons[3].innerText.trim(), 'context menu button 4').to.contain('Add a tag');
    expect(buttons[4].innerText.trim(), 'context menu button 5').to.contain('Duplicate');
};

/**
 * Verifies context menu buttons for admin
 * @param {NodeList} buttons - Button elements
 */
const verifyAdminContextMenuButtons = (buttons) => {
    expect(buttons.length, 'context menu buttons').to.equal(6);
    expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
    expect(buttons[1].innerText.trim(), 'context menu button 1').to.contain('Unpublish');
    expect(buttons[2].innerText.trim(), 'context menu button 2').to.contain('Feature');
    expect(buttons[3].innerText.trim(), 'context menu button 3').to.contain('Add a tag');
    expect(buttons[4].innerText.trim(), 'context menu button 4').to.contain('Duplicate');
    expect(buttons[5].innerText.trim(), 'context menu button 5').to.contain('Delete');
};

/**
 * Duplicates a post and verifies the action
 * @param {Object} context - Test context
 * @param {Node} post - Post element
 * @param {number} postId - Post ID
 */
const duplicatePost = async (context, post, postId) => {
    await triggerEvent(post, 'contextmenu');
    let contextMenu = find('.gh-posts-context-menu');
    let buttons = contextMenu.querySelectorAll('button');
    
    expect(contextMenu, 'context menu').to.exist;
    verifyAdminContextMenuButtons(buttons);

    await click(buttons[4]);

    const posts = findAll('[data-test-post-id]');
    expect(posts.length, 'all posts count').to.equal(5);
    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.url, 'request url').to.match(new RegExp(`/posts/${postId}/copy/`));
};

/**
 * Copies post link and verifies clipboard content
 * @param {Object} context - Test context
 * @param {Node} post - Post element
 * @param {string} postSlug - Post slug
 */
const copyPostLink = async (context, post, postSlug) => {
    sinon.stub(navigator.clipboard, 'writeText').resolves();

    await triggerEvent(post, 'contextmenu');
    let contextMenu = find('.gh-posts-context-menu');
    let buttons = contextMenu.querySelectorAll('button');

    expect(contextMenu, 'context menu').to.exist;
    verifyAdminContextMenuButtons(buttons);

    await click(buttons[0]);

    expect(find('[data-test-text="notification-content"]')).to.contain.text('Post link copied');
    expect(navigator.clipboard.writeText.calledOnce).to.be.true;
    expect(navigator.clipboard.writeText.firstCall.args[0]).to.equal(`http://localhost:4200/${postSlug}/`);
};

/**
 * Copies preview link and verifies clipboard content
 * @param {Object} context - Test context
 * @param {Node} post - Post element
 * @param {string} postUuid - Post UUID
 */
const copyPreviewLink = async (context, post, postUuid) => {
    sinon.stub(navigator.clipboard, 'writeText').resolves();

    await triggerEvent(post, 'contextmenu');
    let contextMenu = find('.gh-posts-context-menu');
    let buttons = contextMenu.querySelectorAll('button');

    expect(contextMenu, 'context menu').to.exist;
    expect(buttons.length, 'context menu buttons').to.equal(5);
    expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy preview link');
    expect(buttons[1].innerText.trim(), 'context menu button 2').to.contain('Feature');
    expect(buttons[2].innerText.trim(), 'context menu button 3').to.contain('Add a tag');
    expect(buttons[3].innerText.trim(), 'context menu button 4').to.contain('Duplicate');
    expect(buttons[4].innerText.trim(), 'context menu button 5').to.contain('Delete');

    await click(buttons[0]);

    expect(find('[data-test-text="notification-content"]')).to.contain.text('Preview link copied');
    expect(navigator.clipboard.writeText.calledOnce).to.be.true;
    expect(navigator.clipboard.writeText.firstCall.args[0]).to.equal(`http://localhost:4200/p/${postUuid}/`);
};

/**
 * Selects multiple posts
 * @param {Array} postContainers - Post container elements
 */
const selectMultiplePosts = async (postContainers) => {
    for (const container of postContainers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

/**
 * Verifies posts are selected
 * @param {Array} postContainers - Post container elements
 */
const verifyPostsSelected = (postContainers) => {
    postContainers.forEach(container => {
        expect(container.dataset.selected, 'post selected').to.exist;
    });
};

/**
 * Features posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {Array} postIds - Post IDs
 */
const featurePosts = async (context, postContainer, postIds) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let featureButton = findButton('Feature', buttons);
    expect(featureButton, 'feature button').to.exist;
    await click(featureButton);

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'feature request id').to.equal(`id:['${postIds[0]}','${postIds[1]}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'feature request action').to.equal('feature');
};

/**
 * Unfeatures posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {Array} postIds - Post IDs
 */
const unfeaturePosts = async (context, postContainer, postIds) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let featureButton = findButton('Unfeature', buttons);
    expect(featureButton, 'unfeature button').to.exist;
    await click(featureButton);

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'unfeature request id').to.equal(`id:['${postIds[0]}','${postIds[1]}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unfeature request action').to.equal('unfeature');
};

/**
 * Adds a tag to posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {Array} postIds - Post IDs
 */
const addTagToPosts = async (context, postContainer, postIds) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let addTagButton = findButton('Add a tag', buttons);
    expect(addTagButton, 'add tag button').to.exist;
    await click(addTagButton);

    const addTagsModal = find('[data-test-modal="add-tags"]');
    expect(addTagsModal, 'tag settings modal').to.exist;

    const input = addTagsModal.querySelector('input');
    expect(input, 'tag input').to.exist;
    await fillIn(input, 'test-tag');
    await triggerKeyEvent(input, 'keydown', 13);
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-2);
    expect(lastRequest.queryParams.filter, 'add tag request id').to.equal(`id:['${postIds[0]}','${postIds[1]}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'add tag request action').to.equal('addTag');
};

/**
 * Changes post access and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {Array} postIds - Post IDs
 * @param {string} accessLevel - Access level to set
 */
const changePostAccess = async (context, postContainer, postIds, accessLevel) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    let buttons = contextMenu.querySelectorAll('button');
    let changeAccessButton = findButton('Change access', buttons);

    await click(changeAccessButton);

    let changeAccessModal = find('[data-test-modal="edit-posts-access"]');
    let selectElement = changeAccessModal.querySelector('select');
    await fillIn(selectElement, accessLevel);
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest