Here's the refactored code with reduced complexity through better separation of concerns:

```typescript
import NiceModal from '@ebay/nice-modal-react';
import React, {useEffect, useRef} from 'react';
import TierDetailPreview from './tier-detail-preview';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {Button, type ButtonProps, ConfirmationModal, CurrencyField, Form, Heading, Icon, Modal, Select, SortableList, TextField, Toggle, URLTextField, showToast, useSortableIndexedList} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {type Tier, useAddTier, useBrowseTiers, useEditTier} from '@tryghost/admin-x-framework/api/tiers';
import {currencies, currencySelectGroups, validateCurrencyAmount} from '../../../../utils/currency';
import {getSettingValues, useEditSettings} from '@tryghost/admin-x-framework/api/settings';

export type TierFormState = Partial<Omit<Tier, 'trial_days'>> & {
    trial_days: string;
};

// --- Hooks ---

const useTierFormValidators = (formState: TierFormState) => ({
    name: () => (formState.name ? undefined : 'Enter a name for the tier'),
    monthly_price: () => (formState.type !== 'free'
        ? validateCurrencyAmount(formState.monthly_price || 0, formState.currency, {allowZero: false})
        : undefined),
    yearly_price: () => (formState.type !== 'free'
        ? validateCurrencyAmount(formState.yearly_price || 0, formState.currency, {allowZero: false})
        : undefined)
});

const usePortalPlans = (localSettings: ReturnType<typeof useSettingGroup>['localSettings']) => {
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    return JSON.parse(portalPlansJson?.toString() || '[]') as string[];
};

const useTierSave = ({
    tier,
    isFreeTier,
    formState,
    portalPlans,
    updateTier,
    createTier,
    editSettings
}: {
    tier?: Tier;
    isFreeTier: boolean;
    formState: TierFormState;
    portalPlans: string[];
    updateTier: (tier: Tier) => Promise<unknown>;
    createTier: (values: Partial<Tier>) => Promise<unknown>;
    editSettings: (settings: {key: string; value: string}[]) => Promise<unknown>;
}) => async () => {
    const {trial_days: trialDays, currency, ...rest} = formState;
    const values: Partial<Tier> = rest;

    values.benefits = values.benefits?.filter(Boolean);

    if (!isFreeTier) {
        values.currency = currency;
        values.trial_days = parseInt(trialDays);
    }

    if (tier?.id) {
        await updateTier({...tier, ...values});
    } else {
        await createTier(values);
    }

    if (isFreeTier) {
        await syncFreePortalPlan(formState.visibility === 'public', portalPlans, editSettings);
    }
};

const syncFreePortalPlan = async (
    visible: boolean,
    portalPlans: string[],
    editSettings: (settings: {key: string; value: string}[]) => Promise<unknown>
) => {
    const hasFree = portalPlans.includes('free');
    if (hasFree === visible) {
        return;
    }

    const updatedPlans = visible
        ? [...portalPlans, 'free']
        : portalPlans.filter(plan => plan !== 'free');

    await editSettings([{key: 'portal_plans', value: JSON.stringify(updatedPlans)}]);
};

// --- Confirmation Modal ---

const getTierStatusChangeConfig = (tier: Tier) => ({
    title: tier.active ? 'Archive tier' : 'Reactivate tier',
    okLabel: tier.active ? 'Archive' : 'Reactivate',
    okColor: tier.active ? 'red' : 'black',
    prompt: tier.active ? (
        <>
            <div className='mb-6'>Members will no longer be able to subscribe to <strong>{tier.name}</strong> and it will be removed from the list of available tiers in portal.</div>
            <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
        </>
    ) : (
        <>
            <div className='mb-6'>Reactivating <strong>{tier.name}</strong> will re-enable it as an option in portal and allow new members to subscribe to this tier.</div>
            <div>Existing members will remain unchanged.</div>
        </>
    )
});

const useConfirmTierStatusChange = (tier: Tier | undefined, updateTier: (tier: Tier) => Promise<unknown>) => () => {
    if (!tier) {
        return;
    }

    const {title, prompt, okLabel, okColor} = getTierStatusChangeConfig(tier);

    NiceModal.show(ConfirmationModal, {
        title,
        prompt,
        okLabel,
        okColor,
        cancelLabel: 'Cancel',
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

const getLeftButtonProps = (tier: Tier | undefined, onConfirm: () => void): ButtonProps => {
    if (!tier) {
        return {};
    }
    if (tier.active && tier.type !== 'free') {
        return {label: 'Archive tier', color: 'red', link: true, onClick: onConfirm};
    }
    if (!tier.active) {
        return {label: 'Reactivate tier', color: 'green', link: true, onClick: onConfirm};
    }
    return {};
};

// --- Sub-components ---

const PricesSection: React.FC<{
    formState: TierFormState;
    errors: ErrorMessages;
    hasFreeTrial: boolean;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
    toggleFreeTrial: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({formState, errors, hasFreeTrial, updateForm, clearError, toggleFreeTrial}) => (
    <div className='flex flex-col gap-10 md:flex-row'>
        <div className='basis-1/2'>
            <div className='mb-1 flex h-6 items-center justify-between'>
                <Heading level={6}>Prices</Heading>
                <div className='-mr-2 w-[50px]'>
                    <Select
                        border={false}
                        containerClassName='font-medium'
                        controlClasses={{menu: 'w-18'}}
                        options={currencySelectGroups()}
                        selectedOption={currencySelectGroups().flatMap(group => group.options).find(option => option.value === formState.currency)}
                        size='xs'
                        clearBg
                        isSearchable
                        onSelect={option => updateForm(state => ({...state, currency: option?.value}))}
                    />
                </div>
            </div>
            <div className='flex flex-col gap-2'>
                <CurrencyField
                    error={Boolean(errors.monthly_price)}
                    hint={errors.monthly_price}
                    placeholder='5'
                    rightPlaceholder={`${formState.currency}/month`}
                    title='Monthly price'
                    valueInCents={formState.monthly_price || ''}
                    hideTitle
                    onBlur={event => (event.target.value === '' ? updateForm(state => ({...state, monthly_price: 0})) : null)}
                    onChange={price => updateForm(state => ({...state, monthly_price: price}))}
                    onKeyDown={() => clearError('monthly_price')}
                />
                <CurrencyField
                    error={Boolean(errors.yearly_price)}
                    hint={errors.yearly_price}
                    placeholder='50'
                    rightPlaceholder={`${formState.currency}/year`}
                    title='Yearly price'
                    valueInCents={formState.yearly_price || ''}
                    hideTitle
                    onBlur={event => (event.target.value === '' ? updateForm(state => ({...state, yearly_price: 0})) : null)}
                    onChange={price => updateForm(state => ({...state, yearly_price: price}))}
                    onKeyDown={() => clearError('yearly_price')}
                />
            </div>
        </div>
        <div className='basis-1/2'>
            <div className='mb-1 flex h-6 flex-col justify-center'>
                <Toggle checked={hasFreeTrial} label='Add a free trial' labelStyle='heading' onChange={toggleFreeTrial} />
            </div>
            <TextField
                disabled={!hasFreeTrial}
                hint={
                    <div className='mt-1'>
                        Members will be subscribed at full price once the trial ends.{' '}
                        <a className='text-green' href="https://ghost.org/help/free-trials/" rel="noreferrer" target="_blank">Learn more</a>
                    </div>
                }
                placeholder='0'
                rightPlaceholder='days'
                title='Trial days'
                value={formState.trial_days}
                hideTitle
                onChange={e => updateForm(state => ({...state, trial_days: e.target.value.replace(/[^\d]/, '')}))}
            />
        </div>
    </div>
);

const BenefitsSection: React.FC<{
    benefits: ReturnType<typeof useSortableIndexedList>;
}> = ({benefits}) => (
    <Form gap='none' title='Benefits' grouped>
        <div className='-mt-3'>
            <SortableList
                items={benefits.items}
                itemSeparator={false}
                renderItem={({id, item}) => (
                    <div className='relative flex w-full items-center gap-5'>
                        <div className='absolute left-[-32px] top-[7px] flex size-6 items-center justify-center bg-white group-hover:hidden dark:bg-black'>
                            <Icon name='check' size='sm' />
                        </div>
                        <TextField
                            maxLength={191}
                            value={item}
                            onChange={e => benefits.updateItem(id, e.target.value)}
                        />
                        <Button
                            className='absolute right-1 top-1 z-10 opacity-0 group-hover:opacity-100'
                            color='grey'
                            icon='trash'
                            size='sm'
                            onClick={() => benefits.removeItem(id)}
                        />
                    </div>
                )}
                onMove={benefits.moveItem}
            />
        </div>
        <div className="relative mt-1 flex items-center gap-3">
            <Icon className='dark:text-white' name='check' size='sm' />
            <TextField
                className='grow'
                containerClassName='w-100'
                maxLength={191}
                placeholder='Expert analysis'
                title='New benefit'
                value={benefits.newItem}
                hideTitle
                onChange={e => benefits.setNewItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && benefits.addItem()}
            />
            <Button
                className='absolute right-[5px] top-[5px] z-10'
                color='green'
                icon='add'
                iconColorClass='text-white'
                label='Add'
                size='sm'
                hideLabel
                onClick={() => benefits.addItem()}
            />
        </div>
    </Form>
);

// --- Main Component ---

const TierDetailModalContent: React.FC<{tier?: Tier}> = ({tier}) => {
    const isFreeTier = tier?.type === 'free';

    const {updateRoute} = useRouting();
    const {mutateAsync: updateTier} = useEditTier();
    const {mutateAsync: createTier} = useAddTier();
    const {mutateAsync: editSettings} = useEditSettings();
    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);
    const handleError = useHandleError();
    const {localSettings, siteData} = useSettingGroup();
    const portalPlans = usePortalPlans(localSettings);

    const {formState, saveState, updateForm, handleSave, errors, clearError, okProps} = useForm<TierFormState>({
        initialState: {
            ...(tier || {}),
            trial_days: tier?.trial_days?.toString() || '',
            currency: tier?.currency || currencies[0].isoCode,
            visibility: tier?.visibility || 'none',
            welcome_page_url: tier?.welcome_page_url || null
        },
        savingDelay: 500,
        savedDelay: 500,
        onValidate: () => {
            const validators = useTierFormValidators(formState);
            return Object.fromEntries(
                Object.entries(validators).map(([key, validator]) => [key, validator()])
            ) as ErrorMessages;
        },
        onSave: useTierSave({tier, isFreeTier, formState, portalPlans, updateTier, createTier, editSettings}),
        onSaveError: handleError
    });

    const validators = useTierFormValidators(formState);

    const benefits = useSortableIndexedList({
        items: formState.benefits || [],
        setItems: newBenefits => updateForm(state => ({...state, benefits: newBenefits})),
        blank: '',
        canAddNewItem: item => !!item
    });

    const toggleFreeTrial = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setHasFreeTrial(checked);
        updateForm(state => ({
            ...state,
            trial_days: checked ? (tier?.trial_days?.toString() || '7') : '0'
        }));
    };

    const didInitialRender = useRef(false);
    useEffect(() => {
        if (didInitialRender.current) {
            validators.monthly_price?.();
            validators.yearly_price?.();
        }
        didInitialRender.current = true;
    }, [formState.currency]); // eslint-disable-line react-hooks/exhaustive-deps

    const confirmTierStatusChange = useConfirmTierStatusChange(tier, updateTier);
    const leftButtonProps = getLeftButtonProps(tier, confirmTierStatusChange);

    const modalTitle = tier
        ? (tier.active ? 'Edit tier' : 'Edit archived tier')
        : 'New tier';

    return (
        <Modal
            afterClose={() => updateRoute('tiers')}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            leftButtonProps={leftButtonProps}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size='lg'
            testId='tier-detail-modal'
            title={modalTitle}
            stickyFooter
            onOk={async () => handleSave({fakeWhenUnchanged: true})}
        >
            <div className='-mb-8 mt-8 flex items-start gap-8'>
                <div className='flex grow flex-col gap-8'>
                    <Form marginBottom={false} title='Basic' grouped>
                        <TextField
                            autoComplete='off'
                            error={Boolean(errors.name)}
                            hint={errors.name}
                            maxLength={191}
                            placeholder={isFreeTier ? 'Free' : 'Bronze'}
                            title='Name'
                            value={formState.name || ''}
                            autoFocus
                            onChange={e => updateForm(state => ({...state, name: e.target.value}))}
                            onKeyDown={() => clearError('name')}
                        />
                        <TextField
                            autoComplete='off'
                            autoFocus={isFreeTier}
                            maxLength={191}
                            placeholder={isFreeTier ? 'Free preview' : 'Full access to premium content'}
                            title='Description'
                            value={formState.description || ''}
                            onChange={e => updateForm(state => ({...state, description: e.target.value}))}
                        />
                        {!isFreeTier && (
                            <PricesSection
                                clearError={clearError}
                                errors={errors}
                                formState={formState}
                                hasFreeTrial={hasFreeTrial}
                                toggleFreeTrial={toggleFreeTrial}
                                updateForm={updateForm}
                            />
                        )}
                        <URLTextField
                            baseUrl={siteData?.url}
                            hint={`Redirect to this URL after signup${isFreeTier ? '' : ' for premium membership'}`}
                            maxLength={2000}
                            placeholder={siteData?.url}
                            title='Welcome page'
                            value={formState.welcome_page_url || null}
                            nullable
                            transformPathWithoutSlash
                            onChange={value => updateForm(state => ({...state, welcome_page_url: value || null}))}
                        />
                    </Form>
                    <BenefitsSection benefits={benefits} />
                </div>
                <div className='sticky top-[96px] hidden shrink-0 basis-[380px] min-[920px]:!visible min-[920px]:!block'>
                    <TierDetailPreview isFreeTier={isFreeTier} tier={formState} />
                </div>
            </div>
        </Modal>
    );
};

// --- Router Component ---

const TierDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {data: {tiers, isEnd} = {}, fetchNextPage} = useBrowseTiers();

    const tier = params?.id ? tiers?.find(({id}) => id === params.id) : undefined;

    useEffect(() => {
        if (params?.id && !tier && !isEnd) {
            fetchNextPage();
        }
    }, [fetchNextPage, isEnd, params?.id, tier]);

    if (params?.id && !tier) {
        return null;
    }

    return <TierDetailModalContent tier={tier} />;
};

export default NiceModal.create(TierDetailModal);
```

Key refactoring changes made:

1. **Extracted custom hooks**: `useTierFormValidators`, `usePortalPlans`, `useTierSave`, and `useConfirmTierStatusChange` isolate distinct logic from the main component.

2. **Extracted pure functions**: `syncFreePortalPlan`, `getTierStatusChangeConfig`, and `getLeftButtonProps` are now standalone, testable functions.

3. **Extracted sub-components**: `PricesSection` and `BenefitsSection` reduce the JSX complexity of the main component significantly.

4. **Simplified `toggleFreeTrial`**: Merged the two branches into a single conditional expression.

5. **Simplified `syncFreePortalPlan`**: Replaced imperative `splice`/`push` mutations with immutable array operations and an early return guard.

6. **Simplified `TierDetailModal`**: Removed the redundant `let tier` declaration and duplicate `if` block by computing `tier` directly.

7. **Derived `modalTitle`** into a variable to reduce inline ternary nesting in JSX.