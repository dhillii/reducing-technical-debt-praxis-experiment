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

// Helpers
const getLastPostsRequest = (server) => {
    const requests = server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    return requests[requests.length - 1];
};

const getLastRequest = (server) => server.pretender.handledRequests.slice(-1)[0];

const selectTwoPosts = async (postThreeContainer, postFourContainer) => {
    await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
};

const openContextMenu = async (container) => {
    await triggerEvent(container, 'contextmenu');
    return find('.gh-posts-context-menu');
};

const getContextMenuButtons = async (container) => {
    const contextMenu = await openContextMenu(container);
    expect(contextMenu, 'context menu').to.exist;
    return contextMenu.querySelectorAll('button');
};

const verifyPublishedPostContextMenuButtons = (buttons) => {
    expect(buttons.length, 'context menu buttons').to.equal(6);
    expect(buttons[0].innerText.trim()).to.contain('Copy link to post');
    expect(buttons[1].innerText.trim()).to.contain('Unpublish');
    expect(buttons[2].innerText.trim()).to.contain('Feature');
    expect(buttons[3].innerText.trim()).to.contain('Add a tag');
    expect(buttons[4].innerText.trim()).to.contain('Duplicate');
    expect(buttons[5].innerText.trim()).to.contain('Delete');
};

const verifyTagFilterOptions = async (tagSelectSelector) => {
    await clickTrigger(tagSelectSelector);
    let options = findAll('.ember-power-select-option');
    expect(options.length, 'options count').to.equal(4);
    expect(options[0].textContent.trim()).to.equal('All tags');

    await selectSearch(tagSelectSelector, 's');
    options = findAll('.ember-power-select-option');
    expect(options[0].textContent.trim()).to.equal('A - First');
    expect(options[1].textContent.trim()).to.equal('B - Second');
    expect(options[2].textContent.trim()).to.equal('Z - Last');
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
                let contributorRole = this.server.create('role', {name: 'Contributor'});
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
                    expect(find('.gh-posts-context-menu'), 'context menu').to.not.be.visible;
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

                authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                const lastRequest = getLastPostsRequest(this.server);
                expect(lastRequest.queryParams.filter).to.have.string(`authors:${author.slug}`);

                expect(findAll('[data-test-post-id]').length, 'post count').to.equal(1);
                expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author post').to.exist;
            });

            describe('context menu', function () {
                it('does not render the context menu', async function () {
                    await visit('/posts');
                    const post = find(`[data-test-post-id="${authorPost.id}"]`);
                    expect(post, 'post').to.exist;
                    await triggerEvent(post, 'contextmenu');
                    expect(find('.gh-posts-context-menu'), 'context menu').to.not.be.visible;
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

                    const buttons = await getContextMenuButtons(post);
                    expect(buttons.length, 'context menu buttons').to.equal(5);
                    expect(buttons[0].innerText.trim()).to.contain('Copy link to post');
                    expect(buttons[1].innerText.trim()).to.contain('Unpublish');
                    expect(buttons[2].innerText.trim()).to.contain('Feature');
                    expect(buttons[3].innerText.trim()).to.contain('Add a tag');
                    expect(buttons[4].innerText.trim()).to.contain('Duplicate');
                });
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

                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(4);

                    expect(posts[0].querySelector('.gh-content-entry-title').textContent).to.contain('Scheduled Post');
                    expect(posts[1].querySelector('.gh-content-entry-title').textContent).to.contain('Draft Post');
                    expect(posts[2].querySelector('.gh-content-entry-title').textContent).to.contain('Published Post');
                    expect(posts[3].querySelector('.gh-content-entry-title').textContent).to.contain('Editor Published Post');

                    let lastRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/'));
                    expect(lastRequests[0].queryParams.filter).to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter).to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter).to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    let lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.filter).to.have.string('status:draft');
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${draftPost.id}"]`), 'draft post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.filter).to.have.string('status:published');
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);
                    expect(find(`[data-test-post-id="${publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author published post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.filter).to.have.string('status:scheduled');
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                    expect(find(`[data-test-post-id="${scheduledPost.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');
                    await selectChoose('[data-test-author-select]', editor.name);

                    const lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.allFilter).to.have.string('status:[draft,scheduled,published,sent]');
                    expect(lastRequest.queryParams.allFilter).to.have.string(`authors:${editor.slug}`);
                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    let lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.allFilter).to.have.string('visibility:[paid,tiers]');
                    expect(findAll('[data-test-post-id]').length, 'paid posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    lastRequest = getLastPostsRequest(this.server);
                    expect(lastRequest.queryParams.allFilter).to.have.string('visibility:public');
                    expect(findAll('[data-test-post-id]').length, 'public posts count').to.equal(3);
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                    this.server.create('tag', {name: 'A - First', slug: 'first'});

                    await visit('/posts');
                    await verifyTagFilterOptions('[data-test-tag-select]');

                    await selectChoose('[data-test-tag-select]', 'B - Second');
                    const lastRequest = getLastRequest(this.server);
                    expect(lastRequest.queryParams.allFilter).to.have.string('tag:second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');
                    await selectSearch('[data-test-tag-select]', 'Last');

                    const options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');

                    await selectChoose('[data-test-tag-select]',