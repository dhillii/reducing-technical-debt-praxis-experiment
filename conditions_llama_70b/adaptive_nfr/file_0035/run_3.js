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
 *
 * @param {string} text
 * @param {NodeList} buttons
 * @returns Node
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Extracts the last request from the server's handled requests.
 * @param {object} server
 * @returns {object}
 */
const getLastRequest = (server) => {
    return server.pretender.handledRequests.slice(-1)[0];
};

/**
 * Extracts the last posts request from the server's handled requests.
 * @param {object} server
 * @returns {object}
 */
const getLastPostsRequest = (server) => {
    const postsRequests = server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
    return postsRequests[postsRequests.length - 1];
};

/**
 * Extracts the last pages request from the server's handled requests.
 * @param {object} server
 * @returns {object}
 */
const getLastPagesRequest = (server) => {
    const pagesRequests = server.pretender.handledRequests.filter(r => r.url.includes('/pages/') && r.method === 'GET');
    return pagesRequests[pagesRequests.length - 1];
};

/**
 * Checks if the context menu is visible.
 * @param {object} contextMenu
 */
const isContextMenuVisible = (contextMenu) => {
    expect(contextMenu, 'context menu').to.exist;
};

/**
 * Checks if the context menu has the correct buttons.
 * @param {object} contextMenu
 * @param {number} expectedButtonCount
 * @param {string[]} expectedButtonNames
 */
const checkContextMenuButtons = (contextMenu, expectedButtonCount, expectedButtonNames) => {
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, 'context menu buttons').to.equal(expectedButtonCount);
    expectedButtonNames.forEach((name, index) => {
        expect(buttons[index].innerText.trim(), `context menu button ${index + 1}`).to.contain(name);
    });
};

/**
 * Checks if the post is selected.
 * @param {object} postContainer
 */
const isPostSelected = (postContainer) => {
    expect(postContainer.dataset.selected, 'post selected').to.exist;
};

/**
 * Checks if the post is featured.
 * @param {object} postContainer
 */
const isPostFeatured = (postContainer) => {
    expect(postContainer.querySelector('.gh-featured-post'), 'post featured').to.exist;
};

/**
 * Checks if the post is not featured.
 * @param {object} postContainer
 */
const isPostNotFeatured = (postContainer) => {
    expect(postContainer.querySelector('.gh-featured-post'), 'post featured').to.not.exist;
};

/**
 * Checks if the post has the correct status.
 * @param {object} postContainer
 * @param {string} expectedStatus
 */
const checkPostStatus = (postContainer, expectedStatus) => {
    expect(postContainer.querySelector('.gh-content-entry-status').textContent, 'post status').to.contain(expectedStatus);
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

                authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                await selectChoose('[data-test-type-select]', 'Published posts');

                const lastPostsRequest = getLastPostsRequest(this.server);
                expect(lastPostsRequest.queryParams.filter).to.have.string(`authors:${author.slug}`);

                expect(findAll('[data-test-post-id]').length).to.equal(1);
                expect(find(`[data-test-post-id="${authorPost.id}"]`)).to.exist;
            });

            describe('context menu', function () {
                it('does not render the context menu', async function () {
                    await visit('/posts');

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

                    let contextMenu = find('.gh-posts-context-menu');
                    isContextMenuVisible(contextMenu);

                    checkContextMenuButtons(contextMenu, 5, ['Copy link to post', 'Unpublish', 'Feature', 'Add a tag', 'Duplicate']);
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
                    expect(posts.length).to.equal(4);

                    expect(posts[0].querySelector('.gh-content-entry-title').textContent).to.contain('Scheduled Post');
                    expect(posts[1].querySelector('.gh-content-entry-title').textContent).to.contain('Draft Post');
                    expect(posts[2].querySelector('.gh-content-entry-title').textContent).to.contain('Published Post');
                    expect(posts[3].querySelector('.gh-content-entry-title').textContent).to.contain('Editor Published Post');

                    const lastRequests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    expect(lastRequests[0].queryParams.filter).to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter).to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter).to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');

                    const lastPostsRequest = getLastPostsRequest(this.server);
                    expect(lastPostsRequest.queryParams.filter).to.have.string('status:draft');
                    expect(findAll('[data-test-post-id]').length).to.equal(1);
                    expect(find(`[data-test-post-id="${draftPost.id}"]`)).to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');

                    const lastPostsRequest2 = getLastPostsRequest(this.server);
                    expect(lastPostsRequest2.queryParams.filter).to.have.string('status:published');
                    expect(findAll('[data-test-post-id]').length).to.equal(2);
                    expect(find(`[data-test-post-id="${publishedPost.id}"]`)).to.exist;
                    expect(find(`[data-test-post-id="${authorPost.id}"]`)).to.exist;

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');

                    const lastPostsRequest3 = getLastPostsRequest(this.server);
                    expect(lastPostsRequest3.queryParams.filter).to.have.string('status:scheduled');
                    expect(findAll('[data-test-post-id]').length).to.equal(1);
                    expect(find(`[data-test-post-id="${scheduledPost.id}"]`)).to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-author-select]', editor.name);

                    const lastPostsRequest = getLastPostsRequest(this.server);
                    expect(lastPostsRequest.queryParams.allFilter).to.have.string(`authors:${editor.slug}`);
                    expect(lastPostsRequest.queryParams.allFilter).to.have.string('status:[draft,scheduled,published,sent]');
                    expect(findAll('[data-test-post-id]').length).to.equal(1);
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');

                    const lastPostsRequest = getLastPostsRequest(this.server);
                    expect(lastPostsRequest.queryParams.allFilter).to.have.string('visibility:[paid,tiers]');
                    expect(findAll('[data-test-post-id]').length).to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');

                    const lastPostsRequest2 = getLastPostsRequest(this.server);
                    expect(lastPostsRequest2.queryParams.allFilter).to.have.string('visibility:public');
                    expect(findAll('[data-test-post-id]').length).to.equal(3);
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                    this.server.create('tag', {name: 'A - First', slug: 'first'});

                    await visit('/posts');
                    await clickTrigger('[data-test-tag-select]');

                    const options = findAll('.ember-power-select-option');
                    expect(options.length).to.equal(4);
                    expect(options[0].textContent.trim()).to.equal('All tags');

                    await selectSearch('[data-test-tag-select]', 's');

                    const options2 = findAll('.ember-power-select-option');
                    expect(options2[0].textContent.trim()).to.equal('A - First');
                    expect(options2[1].textContent.trim()).to.equal('B - Second');
                    expect(options2[2].textContent.trim()).to.equal('Z - Last');

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
                    expect(options.length).to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');

                    await selectChoose('[data-test-tag-select]', 'Z - Last');

                    const lastRequest = getLastRequest(this.server);
                    expect(lastRequest.queryParams.allFilter).to.have.string('tag:last');
                });

                it('can open with a filtered tag', async function () {
                    const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post with Second tag', tags: [tag]});

                    await visit('/posts?tag=second');

                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length).to.equal(1);
                    expect(posts[0].querySelector('.gh-content-entry-title').textContent).to.contain('Published Post with Second tag');

                    const filter = find('[data-test-tag-select]');
                    expect(filter.textContent.trim()).to.contain('B - Second');
                });
            });

            describe('context menu actions', function () {
                describe('single post', function () {
                    it('can duplicate a post', async function () {
                        await visit('/posts');

                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        const buttons = contextMenu.querySelectorAll('button');
                        expect(buttons.length).to.equal(6);
                        expect(buttons[0].innerText.trim()).to.contain('Copy link to post');
                        expect(buttons[1].innerText.trim()).to.contain('Unpublish');
                        expect(buttons[2].innerText.trim()).to.contain('Feature');
                        expect(buttons[3].innerText.trim()).to.contain('Add a tag');
                        expect(buttons[4].innerText.trim()).to.contain('Duplicate');
                        expect(buttons[5].innerText.trim()).to.contain('Delete');

                        await click(buttons[4]);

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(5);

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.url).to.match(new RegExp(`/posts/${publishedPost.id}/copy/`));
                    });

                    it('can copy a post link', async function () {
                        sinon.stub(navigator.clipboard, 'writeText').resolves();

                        await visit('/posts');

                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        const buttons = contextMenu.querySelectorAll('button');
                        expect(buttons.length).to.equal(6);
                        expect(buttons[0].innerText.trim()).to.contain('Copy link to post');
                        expect(buttons[1].innerText.trim()).to.contain('Unpublish');
                        expect(buttons[2].innerText.trim()).to.contain('Feature');
                        expect(buttons[3].innerText.trim()).to.contain('Add a tag');
                        expect(buttons[4].innerText.trim()).to.contain('Duplicate');
                        expect(buttons[5].innerText.trim()).to.contain('Delete');

                        await click(buttons[0]);

                        expect(find('[data-test-text="notification-content"]')).to.contain.text('Post link copied');

                        expect(navigator.clipboard.writeText.calledOnce).to.be.true;
                        expect(navigator.clipboard.writeText.firstCall.args[0]).to.equal(`http://localhost:4200/${publishedPost.slug}/`);
                    });

                    it('can copy a preview link', async function () {
                        sinon.stub(navigator.clipboard, 'writeText').resolves();

                        await visit('/posts');

                        const post = find(`[data-test-post-id="${draftPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        const buttons = contextMenu.querySelectorAll('button');
                        expect(buttons.length).to.equal(5);
                        expect(buttons[0].innerText.trim()).to.contain('Copy preview link');
                        expect(buttons[1].innerText.trim()).to.contain('Feature');
                        expect(buttons[2].innerText.trim()).to.contain('Add a tag');
                        expect(buttons[3].innerText.trim()).to.contain('Duplicate');
                        expect(buttons[4].innerText.trim()).to.contain('Delete');

                        await click(buttons[0]);

                        expect(find('[data-test-text="notification-content"]')).to.contain.text('Preview link copied');

                        expect(navigator.clipboard.writeText.calledOnce).to.be.true;
                        expect(navigator.clipboard.writeText.firstCall.args[0]).to.equal(`http://localhost:4200/p/${draftPost.uuid}/`);
                    });
                });

                describe('multiple posts', function () {
                    it('can feature and unfeature', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        isPostSelected(postFourContainer);
                        isPostSelected(postThreeContainer);

                        await triggerEvent(postFourContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        let buttons = contextMenu.querySelectorAll('button');
                        const featureButton = findButton('Feature', buttons);
                        expect(featureButton, 'feature button').to.exist;
                        await click(featureButton);

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('feature');

                        isPostFeatured(postThreeContainer);
                        isPostFeatured(postFourContainer);

                        await triggerEvent(postFourContainer, 'contextmenu');

                        contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        buttons = contextMenu.querySelectorAll('button');
                        const unfeatureButton = findButton('Unfeature', buttons);
                        expect(unfeatureButton, 'unfeature button').to.exist;
                        await click(unfeatureButton);

                        const lastRequest2 = getLastRequest(this.server);
                        expect(lastRequest2.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest2.requestBody).bulk.action).to.equal('unfeature');

                        isPostNotFeatured(postThreeContainer);
                        isPostNotFeatured(postFourContainer);
                    });

                    it('can add a tag', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        isPostSelected(postFourContainer);
                        isPostSelected(postThreeContainer);

                        await triggerEvent(postFourContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        let buttons = contextMenu.querySelectorAll('button');
                        const addTagButton = findButton('Add a tag', buttons);
                        expect(addTagButton, 'add tag button').to.exist;
                        await click(addTagButton);

                        const addTagsModal = find('[data-test-modal="add-tags"]');
                        expect(addTagsModal, 'tag settings modal').to.exist;

                        const input = addTagsModal.querySelector('input');
                        expect(input, 'tag input').to.exist;
                        await fillIn(input, 'test-tag');
                        await triggerKeyEvent(input, 'keydown', 13);
                        await click('[data-test-button="confirm"]');

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('addTag');
                    });

                    it('cannot change access when members is disabled', async function () {
                        await visit('/posts');

                        const settingsService = this.owner.lookup('service:settings');
                        await settingsService.set('membersEnabled', false);

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await triggerEvent(postFourContainer, 'contextmenu');

                        expect(find('[data-test-post-context-menu]')).to.exist;
                        expect(find('[data-test-post-context-menu] [data-test-button="change-access"]')).to.not.exist;
                    });

                    it('can change access', async function () {
                        await visit('/posts');

                        const settingsService = this.owner.lookup('service:settings');
                        await settingsService.set('membersEnabled', true);

                        let posts = findAll('[data-test-post-id]');
                        let postThreeContainer = posts[2].parentElement;
                        let postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        await triggerEvent(postFourContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        let buttons = contextMenu.querySelectorAll('button');
                        let changeAccessButton = findButton('Change access', buttons);

                        await click(changeAccessButton);

                        let changeAccessModal = find('[data-test-modal="edit-posts-access"]');
                        let selectElement = changeAccessModal.querySelector('select');
                        await fillIn(selectElement, 'members');
                        await click('[data-test-button="confirm"]');

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('access');

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        postFourContainer = findAll('[data-test-post-id]')[3].parentElement;
                        await triggerEvent(postFourContainer, 'contextmenu');
                        contextMenu = find('.gh-posts-context-menu');
                        buttons = contextMenu.querySelectorAll('button');
                        changeAccessButton = findButton('Change access', buttons);
                        await click(changeAccessButton);
                        changeAccessModal = find('[data-test-modal="edit-posts-access"]');
                        selectElement = changeAccessModal.querySelector('select');
                        expect(selectElement).to.have.value('members');
                        await click(changeAccessModal.querySelector('[data-test-button="cancel"]'));

                        sinon.stub(windowProxy, 'reload');
                        await visit('/editor/post');
                        await fillIn('[data-test-editor-title-input]', 'New post');
                        await blur('[data-test-editor-title-input]');
                        expect(this.server.db.posts.length).to.equal(5);
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

                        expect(find(tiersSelector)).to.not.exist;
                        await fillIn(`${modalSelector} select`, 'tiers');
                        expect(find(tiersSelector)).to.exist;
                        expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(0);

                        await clickTrigger(tiersSelector);
                        await selectChoose(tiersSelector, 'Default Tier');
                        await click(`${modalSelector} [data-test-button="confirm"]`);

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('access');
                        expect(JSON.parse(lastRequest.requestBody).bulk.meta.visibility).to.equal('tiers');
                        expect(JSON.parse(lastRequest.requestBody).bulk.meta.tiers[0].id).to.equal(this.server.schema.tiers.findBy({slug: 'default-tier'}).id);

                        await triggerEvent(postContainer, 'contextmenu');
                        await click('[data-test-post-context-menu] [data-test-button="change-access"]');
                        expect(find(`${modalSelector} select`).value).to.equal('tiers');
                        expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(1);
                        expect(find(`${tiersSelector} [data-test-visibility-segment-option]`).textContent.trim()).to.equal('Default Tier');
                    });

                    it('can unpublish', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        isPostSelected(postFourContainer);
                        isPostSelected(postThreeContainer);

                        await triggerEvent(postFourContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        let buttons = contextMenu.querySelectorAll('button');
                        let unpublishButton = findButton('Unpublish', buttons);
                        expect(unpublishButton, 'unpublish button').to.exist;
                        await click(unpublishButton);

                        const modal = find('[data-test-modal="unpublish-posts"]');
                        expect(modal, 'unpublish modal').to.exist;
                        await click('[data-test-button="confirm"]');

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('unpublish');

                        checkPostStatus(postThreeContainer, 'Draft');
                        checkPostStatus(postFourContainer, 'Draft');
                    });

                    it('can unschedule', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postOneContainer = posts[0].parentElement;

                        await click(postOneContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        isPostSelected(postOneContainer);

                        await triggerEvent(postOneContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        let buttons = contextMenu.querySelectorAll('button');
                        let unscheduleButton = findButton('Unschedule', buttons);
                        expect(unscheduleButton, 'unschedule button').to.exist;
                        await click(unscheduleButton);

                        const modal = find('[data-test-modal="unschedule-posts"]');
                        expect(modal, 'unschedule modal').to.exist;
                        await click('[data-test-button="confirm"]');

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${scheduledPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action).to.equal('unschedule');

                        checkPostStatus(postOneContainer, 'Draft');
                    });

                    it('can delete', async function () {
                        await visit('/posts');

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length).to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        isPostSelected(postFourContainer);
                        isPostSelected(postThreeContainer);

                        await triggerEvent(postFourContainer, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu');
                        isContextMenuVisible(contextMenu);

                        let buttons = contextMenu.querySelectorAll('button');
                        let deleteButton = findButton('Delete', buttons);
                        expect(deleteButton, 'delete button').to.exist;
                        await click(deleteButton);

                        const modal = find('[data-test-modal="delete-posts"]');
                        expect(modal, 'delete modal').to.exist;
                        await click('[data-test-button="confirm"]');

                        const lastRequest = getLastRequest(this.server);
                        expect(lastRequest.queryParams.filter).to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(lastRequest.method).to.equal('DELETE');

                        expect(findAll('[data-test-post-id]').length).to.equal(2);
                    });
                });
            });

            it('can add and edit custom views', async function () {
                await visit('/posts');

                expect(find('[data-test-button="edit-view"]')).to.not.exist;
                expect(find('[data-test-button="add-view"]')).to.not.exist;

                await selectChoose('[data-test-author-select]', admin.name);

                expect(find('[data-test-button="add-view"]')).to.exist;

                await click('[data-test-button="add-view"]');

                expect(find('[data-test-modal="custom-view-form"]')).to.exist;
                expect(find('[data-test-modal="custom-view-form"] h1').textContent.trim()).to.equal('New view');
                await fillIn('[data-test-input="custom-view-name"]', 'Test view');
                await click('[data-test-button="save-custom-view"]');

                expect(find('[data-test-modal="custom-view-form"]')).to.not.exist;

                expect(find('[data-test-nav-custom="posts-Test view"]')).to.exist;
                expect(find('[data-test-nav-custom="posts-Test view"]').textContent.trim()).to.equal('Test view');
                expect(find('[data-test-button="add-view"]')).to.not.exist;
                expect(find('[data-test-button="edit-view"]')).to.exist;

                await click('[data-test-button="edit-view"]');

                expect(find('[data-test-modal="custom-view-form"]')).to.exist;
                expect(find('[data-test-modal="custom-view-form"] h1').textContent.trim()).to.equal('Edit view');
                await fillIn('[data-test-input="custom-view-name"]', 'Updated view');
                await click('[data-test-button="save-custom-view"]');

                expect(find('[data-test-modal="custom-view-form"]')).to.not.exist;

                expect(find('[data-test-nav-custom="posts-Updated view"]')).to.exist;
                expect(find('[data-test-nav-custom="posts-Updated view"]').textContent.trim()).to.equal('Updated view');
                expect(find('[data-test-button="add-view"]')).to.not.exist;
                expect(find('[data-test-button="edit-view"]')).to.exist;
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

                expect(find('[data-test-nav-custom="posts-Drafts"]')).to.exist;
                expect(find('[data-test-nav-custom="posts-Scheduled"]')).to.exist;
                expect(find('[data-test-nav-custom="posts-Published"]')).to.exist;
                expect(find('[data-test-nav-custom="posts-My posts"]')).to.exist;

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

                expect(find('[data-test-nav-custom="posts-My posts"]')).to.exist;

                await click('[data-test-nav-custom="posts-My posts"]');

                expect(find('[data-test-button="edit-view"]')).to.exist;
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
                expect(pages.length).to.equal(4);
            });

            it('can filter pages', async function () {
                await visit('/pages');

                await selectChoose('[data-test-type-select]', 'Draft pages');

                const lastPagesRequest = getLastPagesRequest(this.server);
                expect(lastPagesRequest.queryParams.filter).to.have.string('status:draft');
                expect(findAll('[data-test-post-id]').length).to.equal(1);
                expect(find('[data-test-post-id="3"]')).to.exist;

                await selectChoose('[data-test-type-select]', 'Published pages');

                const lastPagesRequest2 = getLastPagesRequest(this.server);
                expect(lastPagesRequest2.queryParams.filter).to.have.string('status:published');
                expect(findAll('[data-test-post-id]').length).to.equal(2);
                expect(find('[data-test-post-id="1"]')).to.exist;
                expect(find('[data-test-post-id="2"]')).to.exist;

                await selectChoose('[data-test-type-select]', 'Scheduled pages');

                const lastPagesRequest3 = getLastPagesRequest(this.server);
                expect(lastPagesRequest3.queryParams.filter).to.have.string('status:scheduled');
                expect(findAll('[data-test-post-id]').length).to.equal(1);
                expect(find('[data-test-post-id="4"]')).to.exist;
            });

            it('can filter by tag', async function () {
                this.server.create('tag', {name: 'B - Second', slug: 'second'});
                this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                this.server.create('tag', {name: 'A - First', slug: 'first'});

                await visit('/pages');
                await clickTrigger('[data-test-tag-select]');

                const options = findAll('.ember-power-select-option');
                expect(options.length).to.equal(4);
                expect(options[0].textContent.trim()).to.equal('All tags');

                await selectSearch('[data-test-tag-select]', 's');

                const options2 = findAll('.ember-power-select-option');
                expect(options2[0].textContent.trim()).to.equal('A - First');
                expect(options2[1].textContent.trim()).to.equal('B - Second');
                expect(options2[2].textContent.trim()).to.equal('Z - Last');

                await selectChoose('[data-test-tag-select]', 'B - Second');

                const lastRequest = getLastRequest(this.server);
                expect(lastRequest.queryParams.allFilter).to.have.string('tag:second');
            });

            it('can filter by tag with server-side search', async function () {
                this.server.createList('tag', 120);
                this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                await visit('/pages');

                await selectSearch('[data-test-tag-select]', 'Last');

                const options = findAll('.ember-power-select-option');
                expect(options.length).to.equal(1);
                expect(options[0].textContent.trim()).to.equal('Z - Last');

                await selectChoose('[data-test-tag-select]', 'Z - Last');

                const lastRequest = getLastRequest(this.server);
                expect(lastRequest.queryParams.allFilter).to.have.string('tag:last');
            });

            it('can open with a filtered tag', async function () {
                const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page with Second tag', tags: [tag]});

                await visit('/pages?tag=second');

                const pages = findAll('[data-test-post-id]');
                expect(pages.length).to.equal(1);
                expect(pages[0].querySelector('.gh-content-entry-title').textContent).to.contain('Published Page with Second tag');

                const filter = find('[data-test-tag-select]');
                expect(filter.textContent.trim()).to.contain('B - Second');
            });
        });
    });
});