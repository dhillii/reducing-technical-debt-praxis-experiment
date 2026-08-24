const containerViewSelector = '[data-test-post-id]';
const contextMenuSelector = '.gh-posts-context-menu';
const contextMenuButtonSelector = 'button';
const postContextButtonSelector = '[data-test-post-context-menu]';

/**
 * Selects multiple posts by triggering click with meta/ctrl key on each container.
 * @param {Element[]} containers - Array of post container elements.
 * @returns {void}
 */
function selectMultiplePosts(containers) {
    containers.forEach(container => {
        click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    });
}

/**
 * Verifies that all provided post containers have the 'data-selected' attribute set.
 * @param {Element[]} containers - Array of post container elements.
 * @returns {void}
 */
function expectPostsSelected(containers) {
    containers.forEach(container => {
        expect(container.getAttribute('data-selected'), 'post selected').to.exist;
    });
}

/**
 * Retrieves all buttons inside the context menu.
 * @param {void}
 * @returns {NodeList} - All button elements within the context menu.
 */
function getContextMenuButtons() {
    const contextMenu = find(contextMenuSelector);
    return contextMenu.querySelectorAll(contextMenuButtonSelector);
}

/**
 * Opens the context menu on a specific post container by triggering a contextmenu event.
 * @param {Element} container - The post container element.
 * @returns {void}
 */
function openContextMenu(container) {
    triggerEvent(container, 'contextmenu');
    const contextMenu = find(contextMenuSelector);
    expect(contextMenu, 'context menu').to.exist;
}

/**
 * Finds a context menu button by its visible text.
 * @param {string} text - The text content to match.
 * @param {NodeList} buttons - List of button elements in the context menu.
 * @returns {Node|null} - The matched button or null if not found.
 */
function findContextButtonByText(text, buttons) {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
}

/**
 * Triggers a button click in the context menu by button text label.
 * @param {string} label - The visible text of the button to click.
 * @returns {void}
 */
function clickContextButton(label) {
    const buttons = getContextMenuButtons();
    const button = findContextButtonByText(label, buttons);
    expect(button, `${label} button`).to.exist;
    click(button);
}

/**
 * Extracts post container elements from a list of post DOM elements.
 * @param {Element[]} posts - List of post DOM elements.
 * @param {number[]} indices - Indices of posts to extract containers for.
 * @returns {Element[]} - Array of parent elements (containers) for the selected posts.
 */
function extractPostContainers(posts, indices) {
    return indices.map(i => posts[i].parentElement);
}

/**
 * Verifies that a specific post status text is displayed in the container's status element.
 * @param {Element} container - The post container element.
 * @param {string} expectedStatus - The expected status text.
 * @returns {void}
 */
function expectPostStatus(container, expectedStatus) {
    const statusElement = container.querySelector('.gh-content-entry-status');
    expect(statusElement.textContent, 'status text').to.contain(expectedStatus);
}