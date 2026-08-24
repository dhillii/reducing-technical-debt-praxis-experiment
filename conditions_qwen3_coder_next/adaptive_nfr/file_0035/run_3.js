const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

function selectPost(postContainer) {
    return click(postContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
}

function isEmpty(text) {
    return !text || text.trim() === '';
}

function getContextMenuButtons(contextMenu) {
    return contextMenu.querySelectorAll('button');
}

function getFirstVisibleModal(modalSelector) {
    return find(modalSelector);
}

function getSelectedElementFromContainer(container) {
    return container.getAttribute('data-selected');
}

function getButtonByText(buttons, buttonText) {
    return findButton(buttonText, buttons);
}

function clickButton(button) {
    return click(button);
}

async function handleUnpublishUIValidation(container, expectedStatus) {
    expect(container.querySelector('.gh-content-entry-status').textContent).to.contain(expectedStatus);
}

function getPostContainerFromIndex(posts, index) {
    return posts[index].parentElement;
}

function getPostContainers(postElements) {
    return postElements.map(postElement => postElement.parentElement);
}