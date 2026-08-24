okLabel={okProps.label || 'Save'}
        size='lg'
        testId='tier-detail-modal'
        title={getModalTitle(tier)}
        stickyFooter
        onOk={async () => {
            await handleSave({fakeWhenUnchanged: true});
        }}
    >


function getModalTitle(tier?: Tier): string {
    if (!tier) {
        return 'New tier';
    }
    return tier.active ? 'Edit tier' : 'Edit archived tier';
}