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

const setupCommonFixtures = function() {
    this.server.loadFixtures('configs');
    this.server.loadFixtures('settings');
};

const createRoleAndUser = function(roleName) {
    const role = this.server.create('role', {name: roleName});
    return this.server.create('user', {roles: [role]});
};

const createPostsForAdmin = function(admin, editor) {
    return {
        published: this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'}),
        scheduled: this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'}),
        draft: this.server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'}),
        authorPost: this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Published Post'})
    };
};

const verifyPostOrder = function(posts) {
    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
    expect(posts[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
    expect(posts[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
    expect(posts[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');
};

const verifyContextMenuButtons = function(contextMenu, expectedCount, expectedTexts) {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedCount);
    expectedTexts.forEach((text, index) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(text);
    });
};

const selectMultiplePosts = async function(postContainers) {
    for (const container of postContainers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
};

const triggerContextMenu = async function(container) {
    await triggerEvent(container, 'contextmenu');
    return find('.gh-posts-context-menu');
};

const verifyAPIRequest = function(expectedFilter, expectedAction = null) {
    const [lastRequest] = this.server.pretender.handledRequests.slice(-1);
    expect(lastRequest.queryParams.filter || lastRequest.queryParams.allFilter, 'request filter').to.have.string(expectedFilter);
    if (expectedAction) {
        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'request action').to.equal(expectedAction);
    }
    return lastRequest;
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
                createRoleAndUser.call(this, 'Contributor');
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
                beforeEach(async function () {
                    this.publishedPost = this.server.create('post', {status: 'published'});
                });

                it('does not render the context menu', async function () {
                    await visit('/posts');

                    const post = find(`[data-test-post-id="${this.publishedPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as author', function () {
            beforeEach(async function () {
                const authorRole = this.server.create('role', {name: 'Author'});
                this.author = this.server.create('user', {roles: [authorRole]});
                const adminRole = this.server.create('role', {name: 'Administrator'});
                const admin = this.server.create('user', {roles: [adminRole]});

                this.authorPost = this.server.create('post', {authors: [this.author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                const postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                const lastPostsRequest = postsRequests[postsRequests.length - 1];
                expect(lastPostsRequest.queryParams.filter).to.have.string(`authors:${this.author.slug}`);

                expect(findAll('[data-test-post-id]').length, 'post count').to.equal(1);
                expect(find(`[data-test-post-id="${this.authorPost.id}"]`), 'author post').to.exist;
            });

            describe('context menu', function () {
                it('does not render the context menu', async function () {
                    await visit('/posts');

                    const post = find(`[data-test-post-id="${this.authorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as editor', function () {
            beforeEach(async function () {
                const editorRole = this.server.create('role', {name: 'Editor'});
                const editor = this.server.create('user', {roles: [editorRole]});
                this.editorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Post'});

                await authenticateSession();
            });

            describe('context menu', function () {
                it('renders the correct options', async function () {
                    await visit('/posts');

                    const post = find(`[data-test-post-id="${this.editorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.exist;

                    verifyContextMenuButtons(contextMenu, 5, [
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
            beforeEach(async function () {
                this.server.loadFixtures('tiers');

                this.admin = createRoleAndUser.call(this, 'Administrator');
                this.editor = createRoleAndUser.call(this, 'Editor');

                const posts = createPostsForAdmin.call(this, this.admin, this.editor);
                this.publishedPost = posts.published;
                this.scheduledPost = posts.scheduled;
                this.draftPost = posts.draft;
                this.authorPost = posts.authorPost;

                this.server.create('page', {authors: [this.admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(4);

                    verifyPostOrder(posts);

                    const lastRequests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    expect(lastRequests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    verifyAPIRequest.call(this, 'status:draft');
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${this.draftPost.id}"]`), 'draft post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    verifyAPIRequest.call(this, 'status:published');
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);
                    expect(find(`[data-test-post-id="${this.publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${this.authorPost.id}"]`), 'author published post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    verifyAPIRequest.call(this, 'status:scheduled');
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                    expect(find(`[data-test-post-id="${this.scheduledPost.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-author-select]', this.editor.name);

                    const postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    const lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request status filter')
                        .to.have.string('status:[draft,scheduled,published,sent]');
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request filter param')
                        .to.have.string(`authors:${this.editor.slug}`);

                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    verifyAPIRequest.call(this, 'visibility:[paid,tiers]');
                    expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    verifyAPIRequest.call(this, 'visibility:public');
                    expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(3);
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
                    expect(options[0].textContent.trim()).to.equal('A - First');
                    expect(options[1].textContent.trim()).to.equal('B - Second');
                    expect(options[2].textContent.trim()).to.equal('Z - Last');

                    await selectChoose('[data-test-tag-select]', 'B - Second');
                    verifyAPIRequest.call(this, 'tag:second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');
                    await selectSearch('[data-test-tag-select]', 'Last');

                    const options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');