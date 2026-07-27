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