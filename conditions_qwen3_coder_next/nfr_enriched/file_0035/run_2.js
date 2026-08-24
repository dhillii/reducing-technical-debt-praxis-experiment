const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

// Helper to check if element has data-selected attribute using dataset
const isElementSelected = (element) => {
    return element.dataset.selected !== undefined;
};

// Helper to extract button from list by text
const getButtonByText = (text, buttons) => {
    return Array.from(buttons).find(btn => btn.innerText.trim() === text);
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

                let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                let lastPostsRequest = postsRequests[postsRequests.length - 1];
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
                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.exist;

                    const buttons = contextMenu.querySelectorAll('button');
                    expect(buttons.length, 'context menu buttons').to.equal(5);
                    expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
                    expect(buttons[1].innerText.trim(), 'context menu button 2').to.contain('Unpublish');
                    expect(buttons[2].innerText.trim(), 'context menu button 3').to.contain('Feature');
                    expect(buttons[3].innerText.trim(), 'context menu button 4').to.contain('Add a tag');
                    expect(buttons[4].innerText.trim(), 'context menu button 5').to.contain('Duplicate');
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

                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
                    expect(posts[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
                    expect(posts[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
                    expect(posts[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-type-select]', 'Draft posts');
                    let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"drafts" request status filter').to.have.string('status:draft');
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${draftPost.id}"]`), 'draft post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Published posts');
                    postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"published" request status filter').to.have.string('status:published');
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);
                    expect(find(`[data-test-post-id="${publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author published post').to.exist;

                    await selectChoose('[data-test-type-select]', 'Scheduled posts');
                    let scheduledPostsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastScheduledRequest = scheduledPostsRequests[scheduledPostsRequests.length - 1];
                    expect(lastScheduledRequest.queryParams.filter, '"scheduled" request status filter').to.have.string('status:scheduled');
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                    expect(find(`[data-test-post-id="${scheduledPost.id}"]`), 'scheduled post').to.exist;
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
                        let buttons = contextMenu.querySelectorAll('button');

                        expect(contextMenu, 'context menu').to.exist;
                        expect(buttons.length, 'context menu buttons').to.equal(6);
                        expect(buttons[4].innerText.trim(), 'duplicate button').to.contain('Duplicate');

                        await click(buttons[4]);
                        expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(5);
                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.url, 'request url').to.match(new RegExp(`/posts/${publishedPost.id}/copy/`));
                    });

                    it('can copy a post link', async function () {
                        sinon.stub(navigator.clipboard, 'writeText').resolves();

                        await visit('/posts');
                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        let buttons = contextMenu.querySelectorAll('button');

                        expect(buttons[0].innerText.trim(), 'copy link button').to.contain('Copy link to post');
                        await click(buttons[0]);

                        expect(find('[data-test-text="notification-content"]')).to.contain.text('Post link copied');
                        expect(navigator.clipboard.writeText.calledOnce).to.be.true;
                    });
                });

                describe('multiple posts', function () {
                    it('can feature and unfeature', async function () {
                        await visit('/posts');
                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        expect(isElementSelected(postThreeContainer), 'postThree selected').to.be.true;
                        expect(isElementSelected(postFourContainer), 'postFour selected').to.be.true;

                        await triggerEvent(postFourContainer, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        expect(contextMenu, 'context menu').to.exist;

                        let buttons = contextMenu.querySelectorAll('button');
                        let featureButton = getButtonByText('Feature', buttons);
                        expect(featureButton, 'feature button').to.exist;
                        await click(featureButton);

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'feature request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'feature request action').to.equal('feature');

                        expect(postThreeContainer.querySelector('.gh-featured-post')).to.exist;
                        expect(postFourContainer.querySelector('.gh-featured-post')).to.exist;

                        await triggerEvent(postFourContainer, 'contextmenu');
                        contextMenu = find('.gh-posts-context-menu');
                        expect(contextMenu, 'context menu').to.exist;

                        buttons = contextMenu.querySelectorAll('button');
                        featureButton = getButtonByText('Unfeature', buttons);
                        expect(featureButton, 'unfeature button').to.exist;
                        await click(featureButton);

                        [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'unfeature request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unfeature request action').to.equal('unfeature');

                        expect(postThreeContainer.querySelector('.gh-featured-post')).to.not.exist;
                        expect(postFourContainer.querySelector('.gh-featured-post')).to.not.exist;
                    });

                    it('can add a tag', async function () {
                        await visit('/posts');
                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        expect(isElementSelected(postThreeContainer), 'postThree selected').to.be.true;
                        expect(isElementSelected(postFourContainer), 'postFour selected').to.be.true;

                        await triggerEvent(postFourContainer, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        expect(contextMenu, 'context menu').to.exist;

                        let buttons = contextMenu.querySelectorAll('button');
                        let addTagButton = getButtonByText('Add a tag', buttons);
                        expect(addTagButton, 'add tag button').to.exist;
                        await click(addTagButton);

                        const addTagsModal = find('[data-test-modal="add-tags"]');
                        expect(addTagsModal, 'tag settings modal').to.exist;

                        const input = addTagsModal.querySelector('input');
                        expect(input, 'tag input').to.exist;
                        await fillIn(input, 'test-tag');
                        await triggerKeyEvent(input, 'keydown', 13);
                        await click('[data-test-button="confirm"]');

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-2);
                        expect(lastRequest.queryParams.filter, 'add tag request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'add tag request action').to.equal('addTag');
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
                        let changeAccessButton = getButtonByText('Change access', buttons);

                        await click(changeAccessButton);

                        let changeAccessModal = find('[data-test-modal="edit-posts-access"]');
                        let selectElement = changeAccessModal.querySelector('select');
                        await fillIn(selectElement, 'members');
                        await click('[data-test-button="confirm"]');

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'change access request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'change access request action').to.equal('access');
                    });

                    it('can unpublish', async function () {
                        await visit('/posts');
                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        expect(isElementSelected(postThreeContainer), 'postThree selected').to.be.true;
                        expect(isElementSelected(postFourContainer), 'postFour selected').to.be.true;

                        await triggerEvent(postFourContainer, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        expect(contextMenu, 'context menu').to.exist;

                        let buttons = contextMenu.querySelectorAll('button');
                        let unpublishButton = getButtonByText('Unpublish', buttons);
                        expect(unpublishButton, 'unpublish button').to.exist;
                        await click(unpublishButton);

                        const modal = find('[data-test-modal="unpublish-posts"]');
                        expect(modal, 'unpublish modal').to.exist;
                        await click('[data-test-button="confirm"]');

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'unpublish request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'unpublish request action').to.equal('unpublish');

                        expect(postThreeContainer.querySelector('.gh-content-entry-status').textContent, 'postThree status').to.contain('Draft');
                        expect(postFourContainer.querySelector('.gh-content-entry-status').textContent, 'postThree status').to.contain('Draft');
                    });

                    it('can delete', async function () {
                        await visit('/posts');
                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(4);

                        const postThreeContainer = posts[2].parentElement;
                        const postFourContainer = posts[3].parentElement;

                        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
                        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

                        expect(isElementSelected(postThreeContainer), 'postThree selected').to.be.true;
                        expect(isElementSelected(postFourContainer), 'postFour selected').to.be.true;

                        await triggerEvent(postFourContainer, 'contextmenu');
                        let contextMenu = find('.gh-posts-context-menu');
                        expect(contextMenu, 'context menu').to.exist;

                        let buttons = contextMenu.querySelectorAll('button');
                        let deleteButton = getButtonByText('Delete', buttons);
                        expect(deleteButton, 'delete button').to.exist;
                        await click(deleteButton);

                        const modal = find('[data-test-modal="delete-posts"]');
                        expect(modal, 'delete modal').to.exist;
                        await click('[data-test-button="confirm"]');

                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.queryParams.filter, 'delete request id').to.equal(`id:['${publishedPost.id}','${authorPost.id}']`);
                        expect(lastRequest.method, 'delete request method').to.equal('DELETE');

                        expect(findAll('[data-test-post-id]').length, 'all posts count').to.equal(2);
                    });
                });
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

                await selectChoose('[data-test-type-select]', 'Draft pages');
                let pagesRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/pages/') && r.method === 'GET');
                let lastPagesRequest = pagesRequests[pagesRequests.length - 1];
                expect(lastPagesRequest.queryParams.filter, '"drafts" request status filter').to.have.string('status:draft');
                expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                expect(find('[data-test-post-id="3"]'), 'draft page').to.exist;
            });
        });
    });
});