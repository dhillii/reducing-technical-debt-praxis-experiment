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

const setupPostsTest = function(hooks) {
    let hooks_ = setupApplicationTest();
    setupMirage(hooks_);

    beforeEach(async function () {
        this.server.loadFixtures('configs');
        this.server.loadFixtures('settings');
    });

    this.afterEach(function () {
        sinon.restore();
    });

    return hooks_;
};

const createRoleAndUser = function(server, roleName) {
    const role = server.create('role', {name: roleName});
    return server.create('user', {roles: [role]});
};

const createPostsForAdmin = function(server, admin, editor) {
    return {
        published: server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'}),
        scheduled: server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'}),
        draft: server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'}),
        authorPost: server.create('post', {authors: [editor], status: 'published', title: 'Editor Published Post'})
    };
};

const testContextMenuButtons = async function(post, expectedButtonCount, expectedTexts) {
    await triggerEvent(post, 'contextmenu');
    const contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;
    
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedButtonCount);
    
    expectedTexts.forEach((text, index) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(text);
    });
    
    return buttons;
};

const selectMultiplePosts = async function(posts, indices, ctrlOrCmdKey) {
    for (const index of indices) {
        const container = posts[index].parentElement;
        await click(container, {metaKey: ctrlOrCmdKey === 'command', ctrlKey: ctrlOrCmdKey === 'ctrl'});
    }
};

const testFilterRequest = function(server, filterString, requestIndex = -1) {
    const requests = server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    const request = requests[requestIndex];
    expect(request.queryParams.filter, 'filter request').to.have.string(filterString);
    return request;
};

const testBulkAction = async function(server, buttonText, expectedAction, expectedCount) {
    const contextMenu = find('.gh-posts-context-menu');
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
    
    const [lastRequest] = server.pretender.handledRequests.slice(-1);
    expect(JSON.parse(lastRequest.requestBody).bulk.action, `${buttonText} action`).to.equal(expectedAction);
    
    return lastRequest;
};

describe('Acceptance: Posts / Pages', function () {
    setupPostsTest(this);

    describe('posts', function () {
        it('redirects to signin when not authenticated', async function () {
            await invalidateSession();
            await visit('/posts');
            expect(currentURL()).to.equal('/signin');
        });

        describe('as contributor', function () {
            beforeEach(async function () {
                createRoleAndUser(this.server, 'Contributor');
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
                const author = createRoleAndUser(this.server, 'Author');
                const admin = createRoleAndUser(this.server, 'Administrator');

                this.authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});
                this.author = author;

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                testFilterRequest(this.server, `authors:${this.author.slug}`);
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
                const editor = createRoleAndUser(this.server, 'Editor');
                this.editorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Post'});
                await authenticateSession();
            });

            describe('context menu', function () {
                it('renders the correct options', async function () {
                    await visit('/posts');
                    const post = find(`[data-test-post-id="${this.editorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    const expectedTexts = ['Copy link to post', 'Unpublish', 'Feature', 'Add a tag', 'Duplicate'];
                    await testContextMenuButtons(post, 5, expectedTexts);
                });
            });
        });

        describe('as admin', function () {
            beforeEach(async function () {
                this.server.loadFixtures('tiers');

                const admin = createRoleAndUser(this.server, 'Administrator');
                const editor = createRoleAndUser(this.server, 'Editor');

                const posts = createPostsForAdmin(this.server, admin, editor);
                Object.assign(this, posts);
                this.admin = admin;
                this.editor = editor;

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
                    expect(lastRequests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    testFilterRequest(this.server, 'status:draft');
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${this.draft.id}"]`), 'draft post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    testFilterRequest(this.server, 'status:published');
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    testFilterRequest(this.server, 'status:scheduled');
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                });

                it('can filter by author', async function () {
                    await visit('/posts');
                    await selectChoose('[data-test-author-select]', this.editor.name);

                    const requests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    const lastRequest = requests[requests.length - 1];
                    expect(lastRequest.queryParams.allFilter, 'editor filter').to.have.string(`authors:${this.editor.slug}`);
                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    testFilterRequest(this.server, 'visibility:[paid,tiers]');
                    expect(findAll('[data-test-post-id]').length, 'paid posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    testFilterRequest(this.server, 'visibility:public');
                    expect(findAll('[data-test-post-id]').length, 'public posts count').to.equal(3);
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

                    await selectChoose('[data-test-tag-select]', 'B - Second');
                    const [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                    expect(lastRequest.queryParams.allFilter, 'tag filter').to.have.string('tag:second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');
                    await selectSearch('[data-test-tag-select]', 'Last');

                    const options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');

                    await selectChoose('[data-test-tag-select]', 'Z - Last');
                    const [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                    expect(lastRequest.queryParams.allFilter, 'tag filter').to.have.string('tag:last');
                });

                it('can open with a filtered tag', async function () {
                    const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('post', {authors: [this.admin], status: 'published', title: 'Published Post with Second tag', tags: [tag]});

                    await visit('/posts?tag=second');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(1);
                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post title').to.contain('Published Post with Second tag');