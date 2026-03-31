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

const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

const getPostsRequests = (server) => {
    return server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
};

const getPagesRequests = (server) => {
    return server.pretender.handledRequests.filter(r => r.url.includes('/pages/') && r.method === 'GET');
};

const getLastRequest = (server) => {
    return server.pretender.handledRequests.slice(-1)[0];
};

const setupAdminRole = (server) => {
    return server.create('role', {name: 'Administrator'});
};

const setupEditorRole = (server) => {
    return server.create('role', {name: 'Editor'});
};

const setupContributorRole = (server) => {
    return server.create('role', {name: 'Contributor'});
};

const setupAuthorRole = (server) => {
    return server.create('role', {name: 'Author'});
};

const createTestPosts = (server, admin, editor) => {
    return {
        published: server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'}),
        scheduled: server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'}),
        draft: server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'}),
        authorPost: server.create('post', {authors: [editor], status: 'published', title: 'Editor Published Post'})
    };
};

const createTestPages = (server, admin, editor) => {
    return {
        published: server.create('page', {authors: [admin], status: 'published', title: 'Published Page'}),
        editorPublished: server.create('page', {authors: [editor], status: 'published', title: 'Editor Published Page'}),
        draft: server.create('page', {authors: [admin], status: 'draft', title: 'Draft Page'}),
        scheduled: server.create('page', {authors: [admin], status: 'scheduled', title: 'Scheduled Page'})
    };
};

const verifyContextMenuButtons = (contextMenu, expectedButtons) => {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedButtons.length);
    expectedButtons.forEach((expectedText, index) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(expectedText);
    });
};

const selectMultiplePosts = async (posts, indices) => {
    for (const index of indices) {
        const container = posts[index].parentElement;
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

const triggerContextMenu = async (element) => {
    await triggerEvent(element, 'contextmenu');
    return find('.gh-posts-context-menu');
};

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
                const contributorRole = setupContributorRole(this.server);
                this.server.create('user', {roles: [contributorRole]});
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
                const authorRole = setupAuthorRole(this.server);
                author = this.server.create('user', {roles: [authorRole]});
                const adminRole = setupAdminRole(this.server);
                const admin = this.server.create('user', {roles: [adminRole]});

                authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                const postsRequests = getPostsRequests(this.server);
                const lastPostsRequest = postsRequests[postsRequests.length - 1];
                expect(lastPostsRequest.queryParams.filter).to.have.string(`authors:${author.slug}`);

                expect(findAll('[data-test-post-id]').length, 'post count').to.equal(1);
                expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author post').to.exist;
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
                const editorRole = setupEditorRole(this.server);
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
            let admin, editor, posts;

            beforeEach(async function () {
                this.server.loadFixtures('tiers');

                const adminRole = setupAdminRole(this.server);
                admin = this.server.create('user', {roles: [adminRole]});
                const editorRole = setupEditorRole(this.server);
                editor = this.server.create('user', {roles: [editorRole]});

                posts = createTestPosts(this.server, admin, editor);
                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');

                    const postElements = findAll('[data-test-post-id]');
                    expect(postElements.length, 'all posts count').to.equal(4);

                    expect(postElements[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
                    expect(postElements[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
                    expect(postElements[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
                    expect(postElements[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');

                    const lastRequests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    expect(lastRequests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    let postsRequests = getPostsRequests(this.server);
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"drafts" request status filter').to.have.string('status:draft');
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${posts.draft.id}"]`), 'draft post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    postsRequests = getPostsRequests(this.server);
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"published" request status filter').to.have.string('status:published');
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);
                    expect(find(`[data-test-post-id="${posts.published.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${posts.authorPost.id}"]`), 'author published post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    const scheduledPostsRequests = getPostsRequests(this.server);
                    const lastScheduledRequest = scheduledPostsRequests[scheduledPostsRequests.length - 1];
                    expect(lastScheduledRequest.queryParams.filter, '"scheduled" request status filter').to.have.string('status:scheduled');
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                    expect(find(`[data-test-post-id="${posts.scheduled.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-author-select]', editor.name);

                    const postsRequests = getPostsRequests(this.server);
                    const lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request status filter')
                        .to.have.string('status:[draft,scheduled,published,sent]');
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request filter param')
                        .to.have.string(`authors:${editor.slug}`);

                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    let postsRequests = getPostsRequests(this.server);
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:[paid,tiers]');
                    let postElements = findAll('[data-test-post-id]');
                    expect(postElements.length, 'all posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    postsRequests = getPostsRequests(this.server);
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:public');
                    postElements = findAll('[data-test-post-id]');
                    expect(postElements.length, 'all posts count').to.equal(3);
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});