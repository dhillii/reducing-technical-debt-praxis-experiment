constButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

const clickPostContainer = (container, ctrlOrCmd) => {
    return click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
};

const selectMultiplePosts = (containers, ctrlOrCmd) => {
    const promises = containers.map(container => clickPostContainer(container, ctrlOrCmd));
    return Promise.all(promises);
};

const getSelectedAttribute = (element) => element.getAttribute('data-selected');

const isPostSelected = (container) => Boolean(getSelectedAttribute(container));

const triggerContextMenu = (element) => {
    return triggerEvent(element, 'contextmenu');
};

const getMenuButtons = (menuSelector) => {
    const menu = find(menuSelector);
    return menu ? menu.querySelectorAll('button') : [];
};

const getPostContainer = (postId) => {
    const post = find(`[data-test-post-id="${postId}"]`);
    return post ? post.parentElement : null;
};

const getBulkPostSelection = (postIds, ctrlOrCmd) => {
    const containers = postIds.map(id => getPostContainer(id));
    return selectMultiplePosts(containers, ctrlOrCmd).then(() => containers);
};

const getContextMenuButtons = () => getMenuButtons('.gh-posts-context-menu');

const clickButton = (buttons, text) => {
    const button = findButton(text, buttons);
    return click(button);
};

const getButtonByText = (text) => {
    const buttons = getContextMenuButtons();
    return findButton(text, buttons);
};

const pressModifyKey = (ctrlOrCmd) => {
    return {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'};
};

const isMenuVisible = () => !!find('.gh-posts-context-menu');

const getPostCount = () => findAll('[data-test-post-id]').length;

const assertSelectedPosts = (containers, message) => {
    containers.forEach(container => {
        expect(getSelectedAttribute(container), message).to.exist;
    });
};

const ensureUnfeatured = (container, featureSelector, message) => {
    expect(container.querySelector(featureSelector), message).to.not.exist;
};

const ensureFeatured = (container, featureSelector, message) => {
    expect(container.querySelector(featureSelector), message).to.exist;
};