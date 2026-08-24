const getModalTitle = (tier?: Tier): string => {
    if (!tier) {
        return 'New tier';
    }
    return tier.active ? 'Edit tier' : 'Edit archived tier';
};

const getLeftButtonProps = (tier?: Tier): ButtonProps => {
    if (!tier || tier.type === 'free') {
        return {};
    }

    if (tier.active) {
        return {
            label: 'Archive tier',
            color: 'red',
            link: true,
            onClick: confirmTierStatusChangeFactory(tier)
        };
    }

    return {
        label: 'Reactivate tier',
        color: 'green',
        link: true,
        onClick: confirmTierStatusChangeFactory(tier)
    };
};

const confirmTierStatusChangeFactory = (tier: Tier) => {
    return () => {
        const promptTitle = tier.active ? 'Archive tier' : 'Reactivate tier';
        const prompt = tier.active ? <>
            <div className='mb-6'>Members will no longer be able to subscribe to <strong>{tier.name}</strong> and it will be removed from the list of available tiers in portal.</div>
            <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
        </> : <>
            <div className='mb-6'>Reactivating <strong>{tier.name}</strong> will re-enable it as an option in portal and allow new members to subscribe to this tier.</div>
            <div>Existing members will remain unchanged.</div>
        </>;
        const okLabel = tier.active ? 'Archive' : 'Reactivate';

        NiceModal.show(ConfirmationModal, {
            title: promptTitle,
            prompt: prompt,
            okLabel: okLabel,
            cancelLabel: 'Cancel',
            okColor: tier.active ? 'red' : 'black',
            onOk: (confirmModal) => {
                updateTier({...tier, active: !tier.active});
                confirmModal?.remove();
                showToast({
                    type: 'success',
                    title: `Tier ${tier.active ? 'archived' : 'reactivated'}`
                });
            }
        });
    };
};