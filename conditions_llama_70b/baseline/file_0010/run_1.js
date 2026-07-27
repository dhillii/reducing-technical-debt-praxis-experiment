let title = '';
if (tier) {
    title = tier.active ? 'Edit tier' : 'Edit archived tier';
} else {
    title = 'New tier';
}

return <Modal
    afterClose={() => {
        updateRoute('tiers');
    }}
    buttonsDisabled={okProps.disabled}
    cancelLabel='Close'
    dirty={saveState === 'unsaved'}
    leftButtonProps={leftButtonProps}
    okColor={okProps.color}
    okLabel={okProps.label || 'Save'}
    size='lg'
    testId='tier-detail-modal'
    title={title}
    stickyFooter
    onOk={async () => {
        await handleSave({fakeWhenUnchanged: true});
    }}
>
    // ... rest of the code remains the same ...