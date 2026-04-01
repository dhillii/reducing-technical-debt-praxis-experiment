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
 * @param {HTMLElement} contextMenu
 * @param {number} expectedCount
 * @param {Array<{index: number, text: string}>} buttonChecks
 */
const verifyContextMenuButtons = (contextMenu, expectedCount, buttonChecks) => {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedCount);
    buttonChecks.forEach(({index, text}) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(text);
    });
};

/**
 * Triggers context menu and retrieves it
 * @param {HTMLElement} element
 * @returns {Promise<HTMLElement>}
 */
const openContextMenu = async (element) => {
    await triggerEvent(element, 'contextmenu');
    return find('.gh-posts-context-menu');
};

/**
 * Verifies post element exists by ID
 * @param {string} postId
 * @returns {HTMLElement}
 */
const getPostElement = (postId) => {
    const post = find(`[data-test-post-id="${postId}"]`);
    expect(post, 'post').to.exist;
    return post;
};

/**
 * Selects multiple posts using ctrl/cmd+click
 * @param {Array<HTMLElement>} containers
 */
const selectMultiplePosts = async (containers) => {
    for (const container of containers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

/**
 * Verifies post selection state
 * @param {Array<HTMLElement>} containers
 */
const verifyPostsSelected = (containers) => {
    containers.forEach((container, index) => {
        expect(container.getAttribute('data-selected'), `post${index} selected`).to.exist;
    });
};

/**
 * Performs bulk action on selected posts
 * @param {HTMLElement} postContainer
 * @param {string} buttonText
 * @returns {Promise<HTMLElement>}
 */
const performBulkAction = async (postContainer, buttonText) => {
    const contextMenu = await openContextMenu(postContainer);
    expect(contextMenu, 'context menu').to.exist;
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
    return button;
};

/**
 * Verifies API request filter parameter
 * @param {Object} request
 * @param {string} expectedFilter
 * @param {string} description
 */
const verifyRequestFilter = (request, expectedFilter, description) => {
    expect(request.queryParams.filter, description).to.have.string(expectedFilter);
};

/**
 * Verifies bulk API request
 * @param {Object} request
 * @param {string} expectedFilter
 * @param {string} expectedAction
 * @param {string} filterDescription
 * @param {string} actionDescription
 */
const verifyBulkRequest = (request, expectedFilter, expectedAction, filterDescription, actionDescription) => {
    expect(request.queryParams.filter, filterDescription).to.equal(expectedFilter);
    expect(JSON.parse(request.requestBody).bulk.action, actionDescription).to.equal(expectedAction);
};

/**
 * Gets the last request of a specific type
 * @param {Array<Object>} requests
 * @param {string} urlPattern
 * @param {string} method
 * @returns {Object}
 */
const getLastRequest = (requests, urlPattern, method = 'GET') => {
    const filtered = requests.filter(r => r.url.includes(urlPattern) && r.method === method);
    return filtered[filtered.length - 1];
};

/**
 * Verifies post status text
 * @param {HTMLElement} container
 * @param {string} expectedStatus
 * @param {string} description
 */
const verifyPostStatus = (container, expectedStatus, description) => {
    expect(container.querySelector('.gh-content-entry-status').textContent, description).to.contain(expectedStatus);
};

/**
 * Fills and confirms a modal with select element
 * @param {string} modalSelector
 * @param {string} selectValue
 */
const fillAndConfirmModal = async (modalSelector, selectValue) => {
    const modal = find(modalSelector);
    const selectElement = modal.querySelector('select');
    await fillIn(selectElement, selectValue);
    await click('[data-test-button="confirm"]');
};

/**
 * Verifies modal select value
 * @param {string} modalSelector
 * @param {string} expectedValue
 */
const verifyModalSelectValue = (modalSelector, expectedValue) => {
    const modal = find(modalSelector);
    const selectElement = modal.querySelector('select');
    expect(selectElement, 'access select value after changing').to.have.value(expectedValue);
};

/**
 * Verifies filter request parameters
 * @param {Object} request
 * @param {string} filterParam
 * @param {string} expectedValue
 * @param {string} description
 */
const verifyFilterParam = (request, filterParam, expectedValue, description) => {
    expect(request.queryParams[filterParam], description).to.have.string(expectedValue);
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
                    const post = getPostElement(publishedPost.id);

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
                    const post = getPostElement(authorPost.id);

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

                    const post = getPostElement(editorPost.id);

                    await triggerEvent(post, 'contextmenu');

                    // Test that the context menu is rendered
                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.exist;

                    // Test that the context menu has the correct buttons
                    verifyContextMenuButtons(contextMenu, 5, [
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