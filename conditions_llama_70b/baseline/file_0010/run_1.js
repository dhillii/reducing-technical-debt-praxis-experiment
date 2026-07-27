let title = tier ? (tier.active ? 'Edit tier' : 'Edit archived tier') : 'New tier';

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