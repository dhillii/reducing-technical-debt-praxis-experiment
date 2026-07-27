// ...

describe('multiple posts', function () {
    // ...

    it('can feature and unfeature', async function () {
        await visit('/posts');

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postThreeContainer = posts[2].parentElement; // draft post
        const postFourContainer = posts[3].parentElement; // published post

        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postFourContainer.dataset.selected, 'postFour selected').to.exist;
        expect(postThreeContainer.dataset.selected, 'postThree selected').to.exist;

        // ...
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can change access when members is disabled', async function () {
        await visit('/posts');

        const settingsService = this.owner.lookup('service:settings');
        await settingsService.set('membersEnabled', false);

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postThreeContainer = posts[2].parentElement; // published post
        const postFourContainer = posts[3].parentElement; // author post

        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await triggerEvent(postFourContainer, 'contextmenu');

        expect(find('[data-test-post-context-menu]'), 'context menu').to.exist;
        expect(find('[data-test-post-context-menu] [data-test-button="change-access"]'), 'change access button').not.to.exist;
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can change access', async function () {
        await visit('/posts');

        const settingsService = this.owner.lookup('service:settings');
        await settingsService.set('membersEnabled', true);

        let posts = findAll('[data-test-post-id]');
        let postThreeContainer = posts[2].parentElement; // published post
        let postFourContainer = posts[3].parentElement; // author post

        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postFourContainer.dataset.selected, 'postFour selected').to.exist;
        expect(postThreeContainer.dataset.selected, 'postThree selected').to.exist;

        // ...
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can change access with custom tiers', async function () {
        await visit('/posts');

        const settingsService = this.owner.lookup('service:settings');
        await settingsService.set('membersEnabled', true);

        const postContainer = findAll('[data-test-post-id]')[2].parentElement; // published post
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

        // check API request
        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
        expect(lastRequest.queryParams.filter, 'change access request id').to.equal(`id:['${publishedPost.id}']`);
        expect(JSON.parse(lastRequest.requestBody).bulk.action, 'change access request action').to.equal('access');
        expect(JSON.parse(lastRequest.requestBody).bulk.meta.visibility, 'change access request visibility').to.equal('tiers');
        expect(JSON.parse(lastRequest.requestBody).bulk.meta.tiers[0].id, 'change access request tier').to.equal(this.server.schema.tiers.findBy({slug: 'default-tier'}).id);

        // check correct data is shown when re-accessing change access modal
        await triggerEvent(postContainer, 'contextmenu');
        await click('[data-test-post-context-menu] [data-test-button="change-access"]');
        expect(find(`${modalSelector} select`).value).to.equal('tiers');
        expect(findAll(`${tiersSelector} [data-test-visibility-segment-option]`)).to.have.length(1);
        expect(find(`${tiersSelector} [data-test-visibility-segment-option]`).textContent.trim()).to.equal('Default Tier');
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can unpublish', async function () {
        await visit('/posts');

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postThreeContainer = posts[2].parentElement; // draft post
        const postFourContainer = posts[3].parentElement; // published post

        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postFourContainer.dataset.selected, 'postFour selected').to.exist;
        expect(postThreeContainer.dataset.selected, 'postThree selected').to.exist;

        // ...
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can unschedule', async function () {
        await visit('/posts');

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postOneContainer = posts[0].parentElement; // scheduled post

        await click(postOneContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postOneContainer.dataset.selected, 'postOne selected').to.exist;

        // ...
    });

    // ...
});

// ...

describe('multiple posts', function () {
    // ...

    it('can delete', async function () {
        await visit('/posts');

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postThreeContainer = posts[2].parentElement; // draft post
        const postFourContainer = posts[3].parentElement; // published post

        await click(postThreeContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
        await click(postFourContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postFourContainer.dataset.selected, 'postFour selected').to.exist;
        expect(postThreeContainer.dataset.selected, 'postThree selected').to.exist;

        // ...
    });

    // ...
});