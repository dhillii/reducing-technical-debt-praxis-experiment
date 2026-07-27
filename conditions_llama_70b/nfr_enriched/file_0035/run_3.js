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

    it('can add a tag', async function () {
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

    it('can change access when members is enabled', async function () {
        await visit('/posts');

        const settingsService = this.owner.lookup('service:settings');
        await settingsService.set('membersEnabled', true);

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postThreeContainer = posts[2].parentElement; // published post
        const postFourContainer = posts[3].parentElement; // author post

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

        // get all posts
        const posts = findAll('[data-test-post-id]');
        expect(posts.length, 'all posts count').to.equal(4);

        const postContainer = posts[2].parentElement; // published post

        await click(postContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

        expect(postContainer.dataset.selected, 'post selected').to.exist;

        // ...
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