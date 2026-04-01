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
 * Verifies context menu buttons for editor role
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
 * Verifies context menu buttons for admin role
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
 * Copies post link to clipboard and verifies
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
 * Copies preview link to clipboard and verifies
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
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const featurePosts = async (context, postContainer, publishedPostId, authorPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let featureButton = findButton('Feature', buttons);
    expect(featureButton, 'feature button').to.exist;
    await click(featureButton);

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'feature request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'feature request action').to.equal('feature');
};

/**
 * Unfeatures posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const unfeaturePosts = async (context, postContainer, publishedPostId, authorPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let featureButton = findButton('Unfeature', buttons);
    expect(featureButton, 'unfeature button').to.exist;
    await click(featureButton);

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'unfeature request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unfeature request action').to.equal('unfeature');
};

/**
 * Adds a tag to selected posts
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const addTagToPosts = async (context, postContainer, publishedPostId, authorPostId) => {
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
    expect(lastRequest.queryParams.filter, 'add tag request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'add tag request action').to.equal('addTag');
};

/**
 * Changes post access and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const changePostAccess = async (context, postContainer, publishedPostId, authorPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    let buttons = contextMenu.querySelectorAll('button');
    let changeAccessButton = findButton('Change access', buttons);

    await click(changeAccessButton);

    let changeAccessModal = find('[data-test-modal="edit-posts-access"]');
    let selectElement = changeAccessModal.querySelector('select');
    await fillIn(selectElement, 'members');
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'change access request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'change access request action').to.equal('access');
};

/**
 * Unpublishes posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const unpublishPosts = async (context, postContainer, publishedPostId, authorPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let unpublishButton = findButton('Unpublish', buttons);
    expect(unpublishButton, 'unpublish button').to.exist;
    await click(unpublishButton);

    const modal = find('[data-test-modal="unpublish-posts"]');
    expect(modal, 'unpublish modal').to.exist;
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'unpublish request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unpublish request action').to.equal('unpublish');
};

/**
 * Unschedules a post and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} scheduledPostId - Scheduled post ID
 */
const unschedulePost = async (context, postContainer, scheduledPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let unscheduleButton = findButton('Unschedule', buttons);
    expect(unscheduleButton, 'unschedule button').to.exist;
    await click(unscheduleButton);

    const modal = find('[data-test-modal="unschedule-posts"]');
    expect(modal, 'unschedule modal').to.exist;
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'unschedule request id').to.equal(`id:['${scheduledPostId}']`);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unschedule request action').to.equal('unschedule');
};

/**
 * Deletes posts and verifies the action
 * @param {Object} context - Test context
 * @param {Node} postContainer - Post container element
 * @param {string} publishedPostId - Published post ID
 * @param {string} authorPostId - Author post ID
 */
const deletePosts = async (context, postContainer, publishedPostId, authorPostId) => {
    await triggerEvent(postContainer, 'contextmenu');

    let contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;

    let buttons = contextMenu.querySelectorAll('button');
    let deleteButton = findButton('Delete', buttons);
    expect(deleteButton, 'delete button').to.exist;
    await click(deleteButton);

    const modal = find('[data-test-modal="delete-posts"]');
    expect(modal, 'delete modal').to.exist;
    await click('[data-test-button="confirm"]');

    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter, 'delete request id').to.equal(`id:['${publishedPostId}','${authorPostId}']`);
    expect(lastRequest.method, 'delete request method').to.equal('DELETE');
};

/**
 * Verifies featured posts UI
 * @param {Array} postContainers - Post container elements
 */
const verifyPostsFeatured = (postContainers) => {
    postContainers.forEach(container => {
        expect(container.querySelector('.gh-featured-post'), 'post featured').to.exist;
    });
};

/**
 * Verifies unfeatured posts UI
 * @param {Array} postContainers - Post container elements
 */
const verifyPostsUnfeatured = (postContainers) => {
    postContainers.forEach(container => {
        expect(container.querySelector('.gh-featured-post'), 'post featured').to.not.exist;
    });
};

/**
 * Verifies unpublished posts UI
 * @param {Array} postContainers - Post container elements
 */
const verifyPostsUnpublished = (postContainers) => {
    postContainers.forEach(container => {
        expect(container.querySelector('.gh-content-entry-status').textContent, 'post status').to.contain('Draft');
    });
};

/**
 * Verifies unscheduled post UI
 * @param {Node} postContainer - Post container element
 */
const verifyPostUnscheduled = (postContainer) => {
    expect(postContainer.querySelector('.gh-content-entry-status').textContent, 'post status').to.contain('Draft');
};

/**
 * Filters posts by author and verifies results
 * @param {Object} context - Test context
 * @param {string} authorName - Author name
 * @param {string} authorSlug - Author slug
 */
const filterPostsByAuthor = async (context, authorName, authorSlug) => {
    await selectChoose('[data-test-author-select]', authorName);

    let postsRequests = context.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    let lastPostsRequest = postsRequests[postsRequests.length - 1];
    expect(lastPostsRequest.queryParams.allFilter, '"author" request status filter')
        .to.have.string('status:[draft,scheduled,published,sent]');
    expect(lastPostsRequest.queryParams.allFilter, '"author" request filter param')
        .to.have.string(`authors:${authorSlug}`);

    expect(findAll('[data-test-post-id]').length, 'author count').to.equal(1);
};

/**
 * Filters posts by visibility and verifies results
 * @param {Object} context - Test context
 * @param {string} visibilityOption - Visibility option text
 * @param {string} expectedFilter - Expected filter string
 * @param {number} expectedCount - Expected post count
 */
const filterPostsByVisibility = async (context, visibilityOption, expectedFilter, expectedCount) => {
    await selectChoose('[data-test-visibility-select]', visibilityOption);
    let postsRequests = context.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    let lastPostsRequest = postsRequests[postsRequests.length - 1];
    expect(lastPostsRequest.queryParams.allFilter, '"visibility" request filter param')
        .to.have.string(expectedFilter);
    let posts = findAll('[data-test-post-id]');
    expect(posts.length, 'all posts count').to.equal(expectedCount);
};

/**
 * Filters posts by tag and verifies results
 * @param {Object} context - Test context
 * @param {string} tagName - Tag name
 * @param {string} tagSlug - Tag slug
 */
const filterPostsByTag = async (context, tagName, tagSlug) => {
    await selectChoose('[data-test-tag-select]', tagName);
    let [lastRequest] = context.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.allFilter, '"posts" request filter param').to.have.string(`tag:${tagSlug}`);
};

/**
 * Verifies tag search results
 * @param {Array} options - Option elements
 * @param {Array} expectedTags - Expected tag names
 */
const verifyTagSearchResults = (options, expectedTags) => {
    expectedTags.forEach((tag, index) => {
        expect(options[index].textContent.trim()).to.equal(tag);
    });
};

/**
 * Verifies custom view in sidebar
 * @param {string} viewName - View name
 */
const verifyCustomViewInSidebar = (viewName) => {
    expect(find(`[data-test-nav-custom="posts-${viewName}"]`), 'new view nav').to.exist;
    expect(find(`[data-test-nav-custom="posts-${viewName}"]`).textContent.trim()).to.equal(viewName);
};

/**
 * Verifies custom view modal
 * @param {string} expectedTitle - Expected modal title
 */
const verifyCustomViewModal = (expectedTitle) => {
    expect(find('[data-test-modal="custom-view-form"]'), 'custom view modal').to.exist;
    expect(find('[data-test-modal="custom-view-form"] h1').textContent.trim()).to.equal(expectedTitle);
};

/**
 * Saves custom view and verifies modal closes
 */
const saveCustomView = async () => {
    await click('[data-test-button="save-custom-view"]');
    expect(find('[data-test-modal="custom-view-form"]'), 'custom view modal (after save)').to.not.exist;
};

/**
 * Verifies analytics column visibility
 * @param {string} columnClass - Column class name
 * @param {boolean} shouldExist - Whether column should exist
 */
const verifyAnalyticsColumnVisibility = (columnClass, shouldExist) => {
    let column = findAll(columnClass).find(el => el.textContent.trim() === columnClass.split('.')[1]);
    if (shouldExist) {
        expect(column, `${columnClass} column`).to.exist;
    } else {
        expect(column, `${columnClass} column`).to.not.exist;
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

                verifyEmptyPostList(this);
                await createAndVerifyPost(this);
            });

            describe('context menu', function () {
                let publishedPost;

                beforeEach(async function () {
                    publishedPost = this.server.create('post', {status: 'published'});
                });

                it('does not render the context menu', async function () {
                    await visit('/posts');

                    const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await verifyContextMenuNotVisible(post);
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

                    const post = find(`[data-test-post-id="${authorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await verifyContextMenuNotVisible(post);
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

                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.exist;

                    verifyEditorContextMenuButtons(contextMenu);
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

                    verifyPostOrder(posts);
                    verifyPostFilterRequests(this);
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await filterPostsByStatus(this, 'Draft posts', 'status:draft', 1);
                    expect(find(`[data-test-post-id="${draftPost.id}"]`), 'draft post').to.exist;

                    await filterPostsByStatus(this, 'Published posts', 'status:published', 2);
                    expect(find(`[data-test-post-id="${publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author published post').to.exist;

                    await filterPostsByStatus(this, 'Scheduled posts', 'status:scheduled', 1);
                    expect(find(`[data-test-post-id="${scheduledPost.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');

                    await filterPostsByAuthor(this, editor.name, editor.slug);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await filterPostsByVisibility(this, 'Paid members-only', 'visibility:[paid,tiers]', 1);
                    await filterPostsByVisibility(this, 'Public', 'visibility:public', 3);
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                    this.server.create('tag', {name: 'A - First', slug: 'first'});

                    await visit('/posts');
                    await clickTrigger('[data-test-tag-select]');

                    let options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(4);
                    expect(options[0].textContent.trim()).to.equal('All tags');

                    await selectSearch('[data-test-tag-select]', 's');

                    options = findAll('.ember-power-select-option');
                    verifyTagSearchResults(options, ['A - First', 'B - Second', 'Z - Last']);

                    await filterPostsByTag(this, 'B - Second', 'second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');

                    await selectSearch('[data-test-tag-select]', 'Last');

                    let options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');

                    await filterPostsByTag(this, 'Z - Last', 'last');
                });

                it('can open with a filtered tag', async function () {
                    const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post with Second tag', tags: [tag]});

                    await visit('/posts?tag=second');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(1);
                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post title').to.contain('Published Post with Second tag');

                    const filter = find('[data-test-tag-select]');
                    expect(filter.textContent.trim(), 'filter text').to.contain('B - Second');
                });
            });

            describe('context menu actions', function () {
                describe('single post', function () {
                    it('can duplicate a post', async function () {
                        await visit('/posts');

                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await duplicatePost(this, post, publishedPost.id);
                    });

                    it('can copy a post link', async function () {
                        await visit('/posts');

                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await copyPostLink(this, post, publishedPost.slug);
                    });

                    it('can copy a preview link', async function () {
                        await visit('/posts');

                        const post = find(`[data-test-post-id="${draftPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await copyPreviewLink(this, post, draftPost.uuid);
                    });
                });

                describe('multiple posts', function () {
                    it('can feature and unfeature', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        verifyPostsSelected([postThreeContainer, postFourContainer]);

                        await featurePosts(this, postFourContainer, publishedPost.id, authorPost.id);
                        verifyPostsFeatured([postThreeContainer, postFourContainer]);

                        await unfeaturePosts(this, postFourContainer, publishedPost.id, authorPost.id);
                        verifyPostsUnfeatured([postThreeContainer, postFourContainer]);
                    });

                    it('can add a tag', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        verifyPostsSelected([postThreeContainer, postFourContainer]);

                        await addTagToPosts(this, postFourContainer, publishedPost.id, authorPost.id);
                    });

                    it('cannot change access when members is disabled', async function () {
                        await visit('/posts');

                        const settingsService = this.owner.lookup('service:settings');
                        await settingsService.set('membersEnabled', false);

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        await triggerEvent(postFourContainer, 'contextmenu');

                        expect(find('[data-test-post-context-menu]'), 'context menu').to.exist;
                        expect(find('[data-test-post-context-menu] [data-test-button="change-access"]'), 'change access button').not.to.exist;
                    });

                    it('can change access', async function () {
                        await visit('/posts');

                        const settingsService = this.owner.lookup('service:settings');
                        await settingsService.set('membersEnabled', true);

                        let posts = findAll('[data-test-post-id]');
                        let postThreeContainer = posts[2].parentElement;
                        let postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        await changePostAccess(this, postFourContainer, publishedPost.id, authorPost.id);

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        postFourContainer = findAll('[data-test-post-id]')[3].parentElement;
                        await triggerEvent(postFourContainer, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        let buttons = contextMenu.querySelectorAll('button');
                        let changeAccessButton = findButton('Change access', buttons);
                        await click(changeAccessButton);
                        let changeAccessModal = find('[data-test-modal="edit-posts-access"]');
                        let selectElement = changeAccessModal.querySelector('select');
                        expect(selectElement, 'access select value after changing').to.have.value('members');
                        await click(changeAccessModal.querySelector('[data-test-button="cancel"]'));

                        sinon.stub(windowProxy, 'reload');
                        await visit('/editor/post');
                        await fillIn('[data-test-editor-title-input]', 'New post');
                        await blur('[data-test-editor-title-input]');
                        expect(this.server.db.posts.length, 'posts count after new post save').to.equal(5);
                    });

                    it('can change access with custom tiers', async function () {
                        await visit('/posts');

                        const settingsService = this.owner.lookup('service:settings');
                        await settingsService.set('membersEnabled', true);

                        const postContainer = findAll('[data-test-post-id]')[2].parentElement;
                        await triggerEvent(postContainer, 'contextmenu');
                        await click('[data-test-post-context-menu] [data-test-button="change-access"]');

                        const modalSelector = '[data-test-modal="edit-posts-access"]';
                        const tiersSelector = `${modalSelector} [data-test-visibility-segment-select]`;

                        expect(find(tiersSelector)).not.to.exist;
                        await fillIn(`${modalSelector} select`, 'tiers');
                        expect(find(tiersSelector)).to.exist;
                        expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(0);

                        await clickTrigger(tiersSelector);
                        await selectChoose(tiersSelector, 'Default Tier');
                        await click(`${modalSelector} [data-test-button="confirm"]`);

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'change access request id').to.equal(`id:['${publishedPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'change access request action').to.equal('access');
                        expect(JSON.parse(lastRequest.requestBody).bulk.meta.visibility, 'change access request visibility').to.equal('tiers');
                        expect(JSON.parse(lastRequest.requestBody).bulk.meta.tiers[0].id, 'change access request tier').to.equal(this.server.schema.tiers.findBy({slug: 'default-tier'}).id);

                        await triggerEvent(postContainer, 'contextmenu');
                        await click('[data-test-post-context-menu] [data-test-button="change-access"]');
                        expect(find(`${modalSelector} select`).value).to.equal('tiers');
                        expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(1);
                        expect(find(`${tiersSelector} [data-test-visibility-segment-option]`).textContent.trim()).to.equal('Default Tier');
                    });

                    it('can unpublish', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        verifyPostsSelected([postThreeContainer, postFourContainer]);

                        await unpublishPosts(this, postFourContainer, publishedPost.id, authorPost.id);
                        verifyPostsUnpublished([postThreeContainer, postFourContainer]);
                    });

                    it('can unschedule', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postOneContainer = posts[0].parentElement;

                        await click(postOneContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        expect(postOneContainer.dataset.selected, 'postOne selected').to.exist;

                        await unschedulePost(this, postOneContainer, scheduledPost.id);
                        verifyPostUnscheduled(postOneContainer);
                    });

                    it('can delete', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await selectMultiplePosts([postThreeContainer, postFourContainer]);
                        verifyPostsSelected([postThreeContainer, postFourContainer]);

                        await deletePosts(this, postFourContainer, publishedPost.id, authorPost.id);
                        expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(2);
                    });
                });
            });

            it('can add and edit custom views', async function () {
                await visit('/posts');
                expect(find('[data-test-button="edit-view"]'), 'edit-view button (no filter)').to.not.exist;
                expect(find('[data-test-button="add-view"]'), 'add-view button (no filter)').to.not.exist;

                await selectChoose('[data-test-author-select]', admin.name);
                expect(find('[data-test-button="add-view"]'), 'add-view button (with filter)').to.exist;

                await click('[data-test-button="add-view"]');
                verifyCustomViewModal('New view');
                await fillIn('[data-test-input="custom-view-name"]', 'Test view');
                await saveCustomView();

                verifyCustomViewInSidebar('Test view');
                expect(find('[data-test-button="add-view"]'), 'add-view button (on existing view)').to.not.exist;
                expect(find('[data-test-button="edit-view"]'), 'edit-view button (on existing view)').to.exist;

                await click('[data-test-button="edit-view"]');
                verifyCustomViewModal('Edit view');
                await fillIn('[data-test-input="custom-view-name"]', 'Updated view');
                await saveCustomView();

                verifyCustomViewInSidebar('Updated view');
                expect(find('[data-test-button="add-view"]'), 'add-view button (after edit)').to.not.exist;
                expect(find('[data-test-button="edit-view"]'), 'edit-view button (after edit)').to.exist;
            });

            it('can navigate to custom views', async function () {
                this.server.schema.settings.findBy({key: 'shared_views'}).update({
                    group: 'site',
                    key: 'shared_views',
                    value: JSON.stringify([{
                        route: 'posts',
                        name: 'My posts',
                        filter: {
                            author: admin.slug
                        }
                    }])
                });

                await visit('/posts');

                expect(find('[data-test-nav-custom="posts-Drafts"]'), 'drafts nav').to.exist;
                expect(find('[data-test-nav-custom="posts-Scheduled"]'), 'scheduled nav').to.exist;
                expect(find('[data-test-nav-custom="posts-Published"]'), 'published nav').to.exist;
                expect(find('[data-test-nav-custom="posts-My posts"]'), 'my posts nav').to.exist;

                expect(find('[data-test-screen-title]')).to.have.rendered.trimmed.text('Posts');
                expect(find('[data-test-nav="posts"]')).to.have.class('active');

                await click('[data-test-nav-custom="posts-Scheduled"]');
                expect(currentURL()).to.equal('/posts?type=scheduled');
                expect(find('[data-test-screen-title]').innerText).to.match(/Scheduled/);
                expect(find('[data-test-nav-custom="posts-Scheduled"]')).to.have.class('active');

                await click('[data-test-nav="posts"]');
                expect(currentURL()).to.equal('/posts');
                expect(find('[data-test-screen-title]')).to.have.rendered.trimmed.text('Posts');
                expect(find('[data-test-nav-custom="posts-Scheduled"]')).to.not.have.class('active');

                await selectChoose('[data-test-type-select]', 'Scheduled posts');
                expect(currentURL()).to.equal('/posts?type=scheduled');
                expect(find('[data-test-nav-custom="posts-Scheduled"]')).to.have.class('active');
                expect(find('[data-test-screen-title]').innerText).to.match(/Scheduled/);
            });

            it('Shows edit view if order is null, which indicates a bad state', async function () {
                this.server.schema.settings.findBy({key: 'shared_views'}).update({
                    group: 'site',
                    key: 'shared_views',
                    value: JSON.stringify([{
                        route: 'posts',
                        name: 'My posts',
                        filter: {
                            author: admin.slug,
                            order: null
                        }
                    }])
                });

                await visit('/posts');
                expect(find('[data-test-nav-custom="posts-My posts"]'), 'my posts nav').to.exist;
                await click('[data-test-nav-custom="posts-My posts"]');
                expect(find('[data-test-button="edit-view"]'), 'edit-view button (on existing view)').to.exist;
            });
        });

        describe('analytics visibility', function () {
            let publishedPost;

            beforeEach(async function () {
                let adminRole = this.server.create('role', {name: 'Administrator'});
                this.server.create('user', {roles: [adminRole]});

                publishedPost = this.server.create('post', {
                    status: 'published',
                    hasBeenEmailed: true,
                    email: this.server.create('email', {
                        emailCount: 100,
                        openedCount: 50,
                        clickedCount: 25,
                        openRate: 50,
                        clickRate: 25
                    })
                });

                await authenticateSession();
            });

            it('hides visitor count column when webAnalyticsEnabled is disabled', async function () {
                this.server.db.settings.update({key: 'web_analytics_enabled'}, {value: 'false'});

                await visit('/posts');

                let visitorsText = findAll('.gh-content-email-stats').find(el => el.textContent.trim() === 'visitors');
                expect(visitorsText, 'visitor count column').to.not.exist;
            });

            it('hides member conversions column when membersTrackSources is disabled', async function () {
                this.server.db.settings.update({key: 'members_track_sources'}, {value: 'false'});

                await visit('/posts');

                let membersText = findAll('.gh-content-email-stats').find(el => el.textContent.trim() === 'members');
                expect(membersText, 'member conversions column').to.not.exist;
            });

            it('shows analytics button when post has analytics page', async function () {
                publishedPost.update({hasAnalyticsPage: true});

                await visit('/posts');

                expect(find('.gh-post-list-cta.stats'), 'analytics button').to.exist;
                expect(find('.gh-post-list-cta.edit'), 'edit button').to.not.exist;
            });

            it('hides all analytics columns when both settings are disabled', async function () {
                this.server.db.settings.update({key: 'web_analytics'}, {value: 'false'});
                this.server.db.settings.update({key: 'members_track_sources'}, {value: 'false'});

                await visit('/posts');

                let visitorsText = findAll('.gh-content-email-stats').find(el => el.textContent.trim() === 'visitors');
                let membersText = findAll('.gh-content-email-stats').find(el => el.textContent.trim() === 'members');
                expect(visitorsText, 'visitor count column').to.not.exist;
                expect(membersText, 'member conversions column').to.not.exist;
            });

            it('shows email analytics columns regardless of webAnalyticsEnabled and membersTrackSources settings', async function () {
                this.server.db.settings.update({key: 'web_analytics_enabled'}, {value: 'false'});
                this.server.db.settings.update({key: 'members_track_sources'}, {value: 'false'});

                await visit('/posts');

                expect(find('.gh-post-list-metrics-container'), 'metrics container').to.exist;
                expect(currentURL(), 'current URL').to.equal('/posts');
            });
        });

        describe('newsletter analytics display logic', function () {
            beforeEach(async function () {
                let adminRole = this.server.create('role', {name: 'Administrator'});
                this.server.create('user', {roles: [adminRole]});

                await authenticateSession();
            });

            it('shows/hides email analytics section based on post.email', async function () {
                let email1 = this.server.create('email', {
                    emailCount: 1500
                });
                
                this.server.create('post', {
                    status: 'published',
                    hasBeenEmailed: true,
                    email: email1
                });

                this.server.create('post', {
                    status: 'published',
                    hasBeenEmailed: false,
                    email: null
                });

                await visit('/posts');
                
                let postElements = findAll('.gh-posts-list-item');
                expect(postElements.length).to.equal(2);
                
                let firstPost = postElements[0];
                let emailSection = firstPost.querySelector('.gh-post-analytics-email-metrics');
                expect(emailSection, 'email analytics section for post with email').to.exist;
                
                let secondPost = postElements[1];
                let noEmailSection = secondPost.querySelector('.gh-post-analytics-email-metrics');
                expect(noEmailSection, 'email analytics section for post without email').to.not.exist;
            });

            it('displays newsletter columns based on email tracking settings', async function () {
                let email1 = this.server.create('email', {
                    emailCount: 15000,
                    trackOpens: false,
                    trackClicks: false
                });
                
                this.server.create('post', {
                    status: 'published',
                    hasBeenEmailed: true,
                    email: email1,
                    showEmailOpenAnalytics: false,
                    showEmailClickAnalytics: false
                });

                await visit('/posts');
                
                expect(find('[data-test-analytics-sent]'), 'sent column').to.exist;
                expect(find('[data-test-analytics-sent] .gh-content-email-stats-value').textContent.trim()).to.equal('15k');
                expect(find('[data-test-analytics-opens]'), 'opens column when disabled').to.not.exist;
                expect(find('[data-test-analytics-clicks]'), 'clicks column when disabled').to.not.exist;
            });
        });
    });

    describe('pages', function () {
        describe('as admin', function () {
            let admin, editor;

            beforeEach(async function () {
                let adminRole = this.server.create('role', {name: 'Administrator'});
                admin = this.server.create('user', {roles: [adminRole]});
                let editorRole = this.server.create('role', {name: 'Editor'});
                editor = this.server.create('user', {roles: [editorRole]});

                this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});
                this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});
                this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});
                this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});

                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page'});
                this.server.create('page', {authors: [editor], status: 'published', title: 'Editor Published Page'});
                this.server.create('page', {authors: [admin], status: 'draft', title: 'Draft Page'});
                this.server.create('page', {authors: [admin], status: 'scheduled', title: 'Scheduled Page'});

                await authenticateSession();
            });

            it('can view pages', async function () {
                await visit('/pages');

                const pages = findAll('[data-test-post-id]');
                expect(pages.length, 'all pages count').to.equal(4);
            });

            it('can filter pages', async function () {
                await visit('/pages');

                await filterPostsByStatus(this, 'Draft pages', 'status:draft', 1);
                expect(find('[data-test-post-id="3"]'), 'draft page').to.exist;

                await filterPostsByStatus(this, 'Published pages', 'status:published', 2);
                expect(find('[data-test-post-id="1"]'), 'admin published page').to.exist;
                expect(find('[data-test-post-id="2"]'), 'editor published page').to.exist;

                await filterPostsByStatus(this, 'Scheduled pages', 'status:scheduled', 1);
                expect(find('[data-test-post-id="4"]'), 'scheduled page').to.exist;
            });

            it('can filter by tag', async function () {
                this.server.create('tag', {name: 'B - Second', slug: 'second'});
                this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                this.server.create('tag', {name: 'A - First', slug: 'first'});

                await visit('/pages');
                await clickTrigger('[data-test-tag-select]');

                let options = findAll('.ember-power-select-option');
                expect(options.length, 'options count').to.equal(4);
                expect(options[0].textContent.trim()).to.equal('All tags');

                await selectSearch('[data-test-tag-select]', 's');

                options = findAll('.ember-power-select-option');
                verifyTagSearchResults(options, ['A - First', 'B - Second', 'Z - Last']);

                await filterPostsByTag(this, 'B - Second', 'second');
            });

            it('can filter by tag with server-side search', async function () {
                this.server.createList('tag', 120);
                this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                await visit('/pages');

                await selectSearch('[data-test-tag-select]', 'Last');

                let options = findAll('.ember-power-select-option');
                expect(options.length, 'options count').to.equal(1);
                expect(options[0].textContent.trim()).to.equal('Z - Last');

                await filterPostsByTag(this, 'Z - Last', 'last');
            });

            it('can open with a filtered tag', async function () {
                const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page with Second tag', tags: [tag]});

                await visit('/pages?tag=second');

                const pages = findAll('[data-test-post-id]');
                expect(pages.length, 'all pages count').to.equal(1);
                expect(pages[0].querySelector('.gh-content-entry-title').textContent, 'post title').to.contain('Published Page with Second tag');

                const filter = find('[data-test-tag-select]');
                expect(filter.textContent.trim(), 'filter text').to.contain('B - Second');
            });
        });
    });
});
```