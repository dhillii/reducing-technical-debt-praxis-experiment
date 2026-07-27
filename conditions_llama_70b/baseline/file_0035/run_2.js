await click(postOneContainer, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});

expect(postOneContainer.dataset.selected, 'postOne selected').to.exist;

// NOTE: right clicks don't seem to work in these tests
//  contextmenu is the event triggered - https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event