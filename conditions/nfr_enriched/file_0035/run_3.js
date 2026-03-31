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

const createRoleAndUser = function(roleName) {
    const role = this.server.create('role', {name: roleName});
    return this.server.create('user', {roles: [role]});
};

const createPostsForAdmin = function(admin) {
    return {
        published: this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'}),
        scheduled: this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'}),
        draft: this.server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'})
    };
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

const getPostsRequests = function() {
    return this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
};

const getPagesRequests = function() {
    return this.server.pretender.handledRequests.filter(r => r.url.includes('/pages/') && r.method === 'GET');
};

const verifyPostsDisplay = function(expectedTitles) {
    const posts = findAll('[data-test-post-id]');
    expect(posts.length, 'posts count').to.equal(expectedTitles.length);
    expectedTitles.forEach((title, index) => {
        expect(posts[index].querySelector('.gh-content-entry-title').textContent, `post ${index + 1} title`).to.contain(title);
    });
};

const testFilterByStatus = async function(filterLabel, expectedCount, expectedPostId) {
    await selectChoose('[data-test-type-select]', filterLabel);
    const requests = getPostsRequests.call(this);
    const lastRequest = requests[requests.length - 1];
    expect(lastRequest.queryParams.filter, `"${filterLabel}" request status filter`).to.have.string(`status:${expectedPostId}`);
    expect(findAll('[data-test-post-id]').length, `${filterLabel} count`).to.equal(expectedCount);
};

const testContextMenuAction = async function(postContainer, buttonText, expectedAction) {
    await triggerEvent(postContainer, 'contextmenu');
    const contextMenu = find('.gh-posts-context-menu');
    expect(contextMenu, 'context menu').to.exist;
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
    return button;
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

                const requests = getPostsRequests.call(this);
                const lastRequest = requests[requests.length - 1];
                expect(lastRequest.queryParams.filter).to.have.string(`authors:${this.author.slug}`);

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
            beforeEach(async function () {
                this.server.loadFixtures('tiers');

                const adminRole = this.server.create('role', {name: 'Administrator'});
                this.admin = this.server.create('user', {roles: [adminRole]});
                const editorRole = this.server.create('role', {name: 'Editor'});
                this.editor = this.server.create('user', {roles: [editorRole]});

                const posts = createPostsForAdmin.call(this, this.admin);
                this.publishedPost = posts.published;
                this.scheduledPost = posts.scheduled;
                this.draftPost = posts.draft;
                this.authorPost = this.server.create('post', {authors: [this.editor], status: 'published', title: 'Editor Published Post'});

                this.server.create('page', {authors: [this.admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');
                    verifyPostsDisplay.call(this, ['Scheduled Post', 'Draft Post', 'Published Post', 'Editor Published Post']);

                    const requests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    expect(requests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
                    expect(requests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
                    expect(requests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await testFilterByStatus.call(this, 'Draft posts', 1, 'draft');
                    expect(find(`[data-test-post-id="${this.draftPost.id}"]`), 'draft post').to.exist;

                    await testFilterByStatus.call(this, 'Published posts', 2, 'published');
                    expect(find(`[data-test-post-id="${this.publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${this.authorPost.id}"]`), 'author published post').to.exist;

                    await testFilterByStatus.call(this, 'Scheduled posts', 1, 'scheduled');
                    expect(find(`[data-test-post-id="${this.scheduledPost.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');
                    await selectChoose('[data-test-author-select]', this.editor.name);

                    const requests = getPostsRequests.call(this);
                    const lastRequest = requests[requests.length - 1];
                    expect(lastRequest.queryParams.allFilter, '"editor" request status filter')
                        .to.have.string('status:[draft,scheduled,published,sent]');
                    expect(lastRequest.queryParams.allFilter, '"editor" request filter param')
                        .to.have.string(`authors:${this.editor.slug}`);

                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    let requests = getPostsRequests.call(this);
                    let lastRequest = requests[requests.length - 1];
                    expect(lastRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:[paid,tiers]');
                    expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    requests = getPostsRequests.call(this);
                    lastRequest = requests[requests.length - 1];
                    expect(lastRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:public');
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
                    let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                    expect(lastRequest.queryParams.allFilter, '"posts" request filter param').to.have.string('tag:second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');