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
 * Verifies context menu button text content
 * @param {NodeList} buttons
 * @param {number} expectedLength
 * @param {Array<{index: number, text: string}>} buttonTexts
 */
const verifyContextMenuButtons = (buttons, expectedLength, buttonTexts) => {
    expect(buttons.length, 'context menu buttons').to.equal(expectedLength);
    buttonTexts.forEach(({index, text}) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(text);
    });
};

/**
 * Gets post container element by post ID
 * @param {string} postId
 * @returns {Element}
 */
const getPostContainer = (postId) => {
    const posts = findAll('[data-test-post-id]');
    return posts.find(post => post.dataset.testPostId === postId)?.parentElement;
};

/**
 * Selects multiple posts with ctrl/cmd key
 * @param {Array<Element>} containers
 */
const selectMultiplePosts = async (containers) => {
    for (const container of containers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

/**
 * Verifies post selection state
 * @param {Array<Element>} containers
 */
const verifyPostsSelected = (containers) => {
    containers.forEach((container, index) => {
        expect(container.dataset.selected, `post ${index} selected`).to.exist;
    });
};

/**
 * Opens context menu and returns it
 * @param {Element} container
 * @returns {Element}
 */
const openContextMenu = async (container) => {
    await triggerEvent(container, 'contextmenu');
    return find('.gh-posts-context-menu');
};

/**
 * Performs bulk action on selected posts
 * @param {Element} contextMenu
 * @param {string} buttonText
 */
const performBulkAction = async (contextMenu, buttonText) => {
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
};

/**
 * Verifies API request filter parameters
 * @param {Object} request
 * @param {string} expectedFilter
 */
const verifyRequestFilter = (request, expectedFilter) => {
    expect(request.queryParams.filter, 'request filter').to.have.string(expectedFilter);
};

/**
 * Verifies bulk action API request
 * @param {Object} request
 * @param {string} expectedFilter
 * @param {string} expectedAction
 */
const verifyBulkActionRequest = (request, expectedFilter, expectedAction) => {
    expect(request.queryParams.filter, 'bulk action request id').to.equal(expectedFilter);
    expect(JSON.parse(request.requestBody).bulk.action, 'bulk action request action').to.equal(expectedAction);
};

/**
 * Verifies post status in UI
 * @param {Element} container
 * @param {string} expectedStatus
 */
const verifyPostStatus = (container, expectedStatus) => {
    expect(container.querySelector('.gh-content-entry-status').textContent, 'post status').to.contain(expectedStatus);
};

/**
 * Handles confirmation modal
 * @param {string} modalSelector
 */
const confirmModal = async (modalSelector) => {
    const modal = find(modalSelector);
    expect(modal, 'modal').to.exist;
    await click('[data-test-button="confirm"]');
};

/**
 * Verifies tag filter options
 * @param {Array<Element>} options
 * @param {Array<string>} expectedTexts
 */
const verifyTagOptions = (options, expectedTexts) => {
    expect(options.length, 'options count').to.equal(expectedTexts.length);
    expectedTexts.forEach((text, index) => {
        expect(options[index].textContent.trim()).to.equal(text);
    });
};

/**
 * Sets up change access modal and fills visibility
 * @param {string} visibility
 */
const setupChangeAccessModal = async (visibility) => {
    const changeAccessModal = find('[data-test-modal="edit-posts-access"]');
    const selectElement = changeAccessModal.querySelector('select');
    await fillIn(selectElement, visibility);
    await click('[data-test-button="confirm"]');
};

/**
 * Verifies change access modal state
 * @param {string} expectedValue
 */
const verifyChangeAccessModalState = async (expectedValue) => {
    const changeAccessModal = find('[data-test-modal="edit-posts-access"]');
    const selectElement = changeAccessModal.querySelector('select');
    expect(selectElement, 'access select value after changing').to.have.value(expectedValue);
    await click(changeAccessModal.querySelector('[data-test-button="cancel"]'));
};

/**
 * Verifies custom view in navigation
 * @param {string} viewName
 * @param {boolean} shouldExist
 */
const verifyCustomViewNav = (viewName, shouldExist) => {
    const navElement = find(`[data-test-nav-custom="posts-${viewName}"]`);
    if (shouldExist) {
        expect(navElement, `${viewName} nav`).to.exist;
        expect(navElement.textContent.trim()).to.equal(viewName);
    } else {
        expect(navElement, `${viewName} nav`).to.not.exist;
    }
};

/**
 * Verifies custom view buttons visibility
 * @param {boolean} addViewExists
 * @param {boolean} editViewExists
 */
const verifyCustomViewButtons = (addViewExists, editViewExists) => {
    const addButton = find('[data-test-button="add-view"]');
    const editButton = find('[data-test-button="edit-view"]');
    
    if (addViewExists) {
        expect(addButton, 'add-view button').to.exist;
    } else {
        expect(addButton, 'add-view button').to.not.exist;
    }
    
    if (editViewExists) {
        expect(editButton, 'edit-view button').to.exist;
    } else {
        expect(editButton, 'edit-view button').to.not.exist;
    }
};

/**
 * Verifies email analytics section visibility
 * @param {Element} postElement
 * @param {boolean} shouldExist
 */
const verifyEmailAnalyticsSection = (postElement, shouldExist) => {
    const emailSection = postElement.querySelector('.gh-post-analytics-email-metrics');
    if (shouldExist) {
        expect(emailSection, 'email analytics section').to.exist;
    } else {
        expect(emailSection, 'email analytics section').to.not.exist;
    }
};

/**
 * Verifies analytics columns visibility
 * @param {boolean} showOpens
 * @param {boolean} showClicks
 * @param {boolean} showSent
 */
const verifyAnalyticsColumns = (showOpens, showClicks, showSent) => {
    if (showSent) {
        expect(find('[data-test-analytics-sent]'), 'sent column').to.exist;
    }
    if (showOpens) {
        expect(find('[data-test-analytics-opens]'), 'opens column').to.exist;
    } else {
        expect(find('[data-test-analytics-opens]'), 'opens column when disabled').to.not.exist;
    }
    if (showClicks) {
        expect(find('[data-test-analytics-clicks]'), 'clicks column').to.exist;
    } else {
        expect(find('[data-test-analytics-clicks]'), 'clicks column when disabled').to.not.exist;
    }
};

// NOTE: With accommodations for faster loading of posts in the UI, the requests to fetch the posts have been split into separate requests based
//  on the status of the post. This means that the tests for filtering by status will have multiple requests to check against.
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
                    verifyContextMenuButtons(buttons, 5, [
                        {index: 0, text: 'Copy link to post'},
                        {index: 1, text: 'Unpublish'},
                        {index: 2, text: 'Feature'},
                        {index: 3, text: 'Add a tag'},
                        {index: 4, text: 'Duplicate'}
                    ]);
                });

                // Note: we cover the functionality of the context menu buttons in the 'as admin' section
            });
        });

        describe('as admin', function () {
            let admin, editor, publishedPost, scheduledPost, draft