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

const findButton = (text, buttons) => Array.from(buttons).find(button => button.innerText.trim() === text);

const setupCommonFixtures = function() {
    this.server.loadFixtures('configs');
    this.server.loadFixtures('settings');
};

const setupAdminUser = function() {
    const adminRole = this.server.create('role', {name: 'Administrator'});
    return this.server.create('user', {roles: [adminRole]});
};

const setupEditorUser = function() {
    const editorRole = this.server.create('role', {name: 'Editor'});
    return this.server.create('user', {roles: [editorRole]});
};

const setupContributorUser = function() {
    const contributorRole = this.server.create('role', {name: 'Contributor'});
    return this.server.create('user', {roles: [contributorRole]});
};

const setupAuthorUser = function() {
    const authorRole = this.server.create('role', {name: 'Author'});
    return this.server.create('user', {roles: [authorRole]});
};

const getPostsRequests = function(server) {
    return server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
};

const getPagesRequests = function(server) {
    return server.pretender.handledRequests.filter(r => r.url.includes('/pages/') && r.method === 'GET');
};

const getLastRequest = function(server) {
    return server.pretender.handledRequests.slice(-1)[0];
};

const verifyContextMenuButtons = function(contextMenu, expectedButtons) {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedButtons.length);
    expectedButtons.forEach((expectedText, index) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(expectedText);
    });
};

const selectMultiplePosts = async function(postContainers) {
    for (const container of postContainers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

const verifyPostsCount = function(expectedCount, message = 'posts count') {
    expect(findAll('[data-test-post-id]').length, message).to.equal(expectedCount);
};

const verifyPostExists = function(postId, message = 'post') {
    expect(find(`[data-test-post-id="${postId}"]`), message).to.exist;
};

const verifyPostNotExists = function(postId, message = 'post') {
    expect(find(`[data-test-post-id="${postId}"]`), message).to.not.exist;
};

const verifyAPIFilter = function(request, expectedFilter, message = 'filter') {
    expect(request.queryParams.filter, message).to.have.string(expectedFilter);
};

const verifyAPIAllFilter = function(request, expectedFilter, message = 'filter') {
    expect(request.queryParams.allFilter, message).to.have.string(expectedFilter);
};

const triggerContextMenu = async function(element) {
    await triggerEvent(element, 'contextmenu');
    return find('.gh-posts-context-menu');
};

const performBulkAction = async function(postContainers, buttonText, expectedAction) {
    await selectMultiplePosts(postContainers);
    const contextMenu = await triggerContextMenu(postContainers[postContainers.length - 1]);
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
    return getLastRequest(this.server);
};

describe('Acceptance: Posts / Pages', function () {
    let hooks = setupApplicationTest();
    setupMirage(hooks);

    beforeEach(async function () {
        setupCommonFixtures.call(this);
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
                setupContributorUser.call(this);
                await authenticateSession();
            });

            it('shows posts list and allows post creation', async function () {
                await visit('/posts');

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
                    const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');
                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as author', function () {
            let author, authorPost;

            beforeEach(async function () {
                author = setupAuthorUser.call(this);
                const admin = setupAdminUser.call(this);

                authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                const postsRequests = getPostsRequests(this.server);
                const lastPostsRequest = postsRequests[postsRequests.length - 1];
                verifyAPIFilter(lastPostsRequest, `authors:${author.slug}`);

                verifyPostsCount(1, 'post count');
                verifyPostExists(authorPost.id, 'author post');
            });

            describe('context menu', function () {
                it('does not render the context menu', async function () {
                    await visit('/posts');
                    const post = find(`[data-test-post-id="${authorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');
                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as editor', function () {
            let editor, editorPost;

            beforeEach(async function () {
                editor = setupEditorUser.call(this);
                editorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Post'});
                await authenticateSession();
            });

            describe('context menu', function () {
                it('renders the correct options', async function () {
                    await visit('/posts');
                    const post = find(`[data-test-post-id="${editorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    const contextMenu = await triggerContextMenu(post);
                    expect(contextMenu, 'context menu').to.exist;

                    verifyContextMenuButtons(contextMenu, [
                        'Copy link to post',
                        'Unpublish',
                        'Feature',
                        'Add a tag',
                        'Duplicate'
                    ]);
                });
            });
        });

        describe('as admin', function () {
            let admin, editor, publishedPost, scheduledPost, draftPost, authorPost;

            beforeEach(async function () {
                this.server.loadFixtures('tiers');
                admin = setupAdminUser.call(this);
                editor = setupEditorUser.call(this);

                publishedPost = this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});
                scheduledPost = this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'});
                draftPost = this.server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'});
                authorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Published Post'});

                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(4);

                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
                    expect(posts[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
                    expect(posts[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
                    expect(posts[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');

                    const lastRequests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    verifyAPIFilter(lastRequests[0], 'status:scheduled', 'scheduled request filter');
                    verifyAPIFilter(lastRequests[1], 'status:draft', 'drafts request filter');
                    verifyAPIFilter(lastRequests[2], 'status:[published,sent]', 'published request filter');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    let postsRequests = getPostsRequests(this.server);
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    verifyAPIFilter(lastPostsRequest, 'status:draft', '"drafts" request status filter');
                    verifyPostsCount(1, 'drafts count');
                    verifyPostExists(draftPost.id, 'draft post');

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    postsRequests = getPostsRequests(this.server);
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    verifyAPIFilter(lastPostsRequest, 'status:published', '"published" request status filter');
                    verifyPostsCount(2, 'published count');
                    verifyPostExists(publishedPost.id, 'admin published post');
                    verifyPostExists(authorPost.id, 'author published post');

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    const scheduledPostsRequests = getPostsRequests(this.server);
                    const lastScheduledRequest = scheduledPostsRequests[scheduledPostsRequests.length - 1];
                    verifyAPIFilter(lastScheduledRequest, 'status:scheduled', '"scheduled" request status filter');
                    verifyPostsCount(1, 'scheduled count');
                    verifyPostExists(scheduledPost.id, 'scheduled post');
                });

                it('can filter by author', async function () {
                    await visit('/posts');
                    await selectChoose('[data-test-author-select]', editor.name);

                    const postsRequests = getPostsRequests(this.server);
                    const lastPostsRequest = postsRequests[postsRequests.length - 1];
                    verifyAPIAllFilter(lastPostsRequest, 'status:[draft,scheduled,published,sent]', '"editor" request status filter');
                    verifyAPIAllFilter(lastPostsRequest, `authors:${editor.slug}`, '"editor" request filter param');

                    verifyPostsCount(1, 'editor count');
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    let postsRequests = getPostsRequests(this.server);
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    verifyAPIAllFilter(lastPostsRequest, 'visibility:[paid,tiers]', '"visibility" request filter param');
                    verifyPostsCount(1, 'all posts count');

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    postsRequests = getPostsRequests(this.server);
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    verifyAPIAllFilter(lastPostsRequest, 'visibility:public', '"visibility" request filter param');
                    verifyPostsCount(3, 'all posts count');
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                    this.server.create('tag', {name: 'A - First', slug: 'first'});

                    await visit('/posts');
                    await clickTrigger('[data-test-tag-select]');

                    let options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(4);
                    expect(options[0].textContent.trim()).