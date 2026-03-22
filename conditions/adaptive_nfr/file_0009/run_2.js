# Refactored Tier Detail Modal

## Key Refactoring Decisions

1. **Extract custom hooks** - Separate concerns for form logic, portal plans, and tier status
2. **Extract sub-components** - Break down the large JSX into focused components
3. **Simplify conditional logic** - Clean up the `leftButtonProps` and portal plans update logic
4. **Reduce nesting** - Flatten deeply nested JSX structures

```typescript
import NiceModal from '@ebay/nice-modal-react';
import React, {useEffect, useRef} from 'react';
import TierDetailPreview from './tier-detail-preview';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {
    Button, type ButtonProps, ConfirmationModal, CurrencyField,
    Form, Heading, Icon, Modal, Select, SortableList, TextField,
    Toggle, URLTextField, showToast, useSortableIndexedList
} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {type Tier, useAddTier, useBrowseTiers, useEditTier} from '@tryghost/admin-x-framework/api/tiers';
import {currencies, currencySelectGroups, validateCurrencyAmount} from '../../../../utils/currency';
import {getSettingValues, useEditSettings} from '@tryghost/admin-x-framework/api/settings';

export type TierFormState = Partial<Omit<Tier, 'trial_days'>> & {
    trial_days: string;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

function usePortalPlans() {
    const {localSettings} = useSettingGroup();
    const {mutateAsync: editSettings} = useEditSettings();
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    const portalPlans = JSON.parse(portalPlansJson?.toString() || '[]') as string[];

    const syncFreeTierVisibility = async (visible: boolean) => {
        const hasFreePlan = portalPlans.includes('free');
        const needsAdd = visible && !hasFreePlan;
        const needsRemove = !visible && hasFreePlan;

        if (!needsAdd && !needsRemove) {
            return;
        }

        const updatedPlans = needsAdd
            ? [...portalPlans, 'free']
            : portalPlans.filter(p => p !== 'free');

        await editSettings([{key: 'portal_plans', value: JSON.stringify(updatedPlans)}]);
    };

    return {syncFreeTierVisibility};
}

function useTierStatusConfirmation(tier: Tier | undefined, updateTier: (t: Tier) => void) {
    if (!tier) {
        return {confirmTierStatusChange: () => {}};
    }

    const confirmTierStatusChange = () => {
        const isActive = tier.active;
        NiceModal.show(ConfirmationModal, {
            title: isActive ? 'Archive tier' : 'Reactivate tier',
            prompt: isActive ? (
                <>
                    <div className='mb-6'>
                        Members will no longer be able to subscribe to <strong>{tier.name}</strong> and
                        it will be removed from the list of available tiers in portal.
                    </div>
                    <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
                </>
            ) : (
                <>
                    <div className='mb-6'>
                        Reactivating <strong>{tier.name}</strong> will re-enable it as an option in
                        portal and allow new members to subscribe to this tier.
                    </div>
                    <div>Existing members will remain unchanged.</div>
                </>
            ),
            okLabel: isActive ? 'Archive' : 'Reactivate',
            cancelLabel: 'Cancel',
            okColor: isActive ? 'red' : 'black',
            onOk: (confirmModal) => {
                updateTier({...tier, active: !tier.active});
                confirmModal?.remove();
                showToast({type: 'success', title: `Tier ${isActive ? 'archived' : 'reactivated'}`});
            }
        });
    };

    return {confirmTierStatusChange};
}

function buildLeftButtonProps(tier: Tier | undefined, onConfirm: () => void): ButtonProps {
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
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type PricesFieldProps = {
    formState: TierFormState;
    errors: ErrorMessages;
    updateForm: (fn: (s: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
};

const PricesField: React.FC<PricesFieldProps> = ({formState, errors, updateForm, clearError}) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 items-center justify-between'>
            <Heading level={6}>Prices</Heading>
            <div className='-mr-2 w-[50px]'>
                <Select
                    border={false}
                    containerClassName='font-medium'
                    controlClasses={{menu: 'w-18'}}
                    options={currencySelectGroups()}
                    selectedOption={currencySelectGroups().flatMap(g => g.options).find(o => o.value === formState.currency)}
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
                onBlur={e => e.target.value === '' && updateForm(state => ({...state, monthly_price: 0}))}
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
                onBlur={e => e.target.value === '' && updateForm(state => ({...state, yearly_price: 0}))}
                onChange={price => updateForm(state => ({...state, yearly_price: price}))}
                onKeyDown={() => clearError('yearly_price')}
            />
        </div>
    </div>
);

type FreeTrialFieldProps = {
    hasFreeTrial: boolean;
    trialDays: string;
    onToggle: (e: React.ChangeEvent<HTMLInputElement>) => void;
    updateForm: (fn: (s: TierFormState) => TierFormState) => void;
};

const FreeTrialField: React.FC<FreeTrialFieldProps> = ({hasFreeTrial, trialDays, onToggle, updateForm}) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 flex-col justify-center'>
            <Toggle checked={hasFreeTrial} label='Add a free trial' labelStyle='heading' onChange={onToggle} />
        </div>
        <TextField
            disabled={!hasFreeTrial}
            hint={
                <div className='mt-1'>
                    Members will be subscribed at full price once the trial ends.{' '}
                    <a className='text-green' href='https://ghost.org/help/free-trials/' rel='noreferrer' target='_blank'>
                        Learn more
                    </a>
                </div>
            }
            placeholder='0'
            rightPlaceholder='days'
            title='Trial days'
            value={trialDays}
            hideTitle
            onChange={e => updateForm(state => ({...state, trial_days: e.target.value.replace(/[^\d]/, '')}))}
        />
    </div>
);

type BenefitsFormProps = {
    benefits: ReturnType<typeof useSortableIndexedList>;
};

const BenefitsForm: React.FC<BenefitsFormProps> = ({benefits}) => (
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
        <div className='relative mt-1 flex items-center gap-3'>
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

// ─── Main Component ───────────────────────────────────────────────────────────

const TierDetailModalContent: React.FC<{tier?: Tier}> = ({tier}) => {
    const isFreeTier = tier?.type === 'free';

    const {updateRoute} = useRouting();
    const {mutateAsync: updateTier} = useEditTier();
    const {mutateAsync: createTier} = useAddTier();
    const {siteData} = useSettingGroup();
    const {syncFreeTierVisibility} = usePortalPlans();
    const handleError = useHandleError();

    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);

    const validators = {
        name: (state: TierFormState) => (state.name ? undefined : 'Enter a name for the tier'),
        monthly_price: (state: TierFormState) => (
            state.type !== 'free'
                ? validateCurrencyAmount(state.monthly_price || 0, state.currency, {allowZero: false})
                : undefined
        ),
        yearly_price: (state: TierFormState) => (
            state.type !== 'free'
                ? validateCurrencyAmount(state.yearly_price || 0, state.currency, {allowZero: false})
                : undefined
        )
    };

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
        onValidate: (state) => {
            const newErrors: ErrorMessages = {};
            Object.entries(validators).forEach(([key, validator]) => {
                newErrors[key as keyof Tier] = validator(state);
            });
            return newErrors;
        },
        onSave: async () => {
            const {trial_days: trialDays, currency, ...rest} = formState;
            const values: Partial<Tier> = {
                ...rest,
                benefits: rest.benefits?.filter(Boolean)
            };

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
                await syncFreeTierVisibility(formState.visibility === 'public');
            }
        },
        onSaveError: handleError
    });

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

    // Only validate amounts on currency change, not on initial render
    const didInitialRender = useRef(false);
    useEffect(() => {
        if (didInitialRender.current) {
            validators.monthly_price(formState);
            validators.yearly_price(formState);
        }
        didInitialRender.current = true;
    }, [formState.currency]); // eslint-disable-line react-hooks/exhaustive-deps

    const {confirmTierStatusChange} = useTierStatusConfirmation(tier, updateTier);
    const leftButtonProps = buildLeftButtonProps(tier, confirmTierStatusChange);

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
                            <div className='flex flex-col gap-10 md:flex-row'>
                                <PricesField
                                    clearError={clearError}
                                    errors={errors}
                                    formState={formState}
                                    updateForm={updateForm}
                                />
                                <FreeTrialField
                                    hasFreeTrial={hasFreeTrial}
                                    trialDays={formState.trial_days}
                                    updateForm={updateForm}
                                    onToggle={toggleFreeTrial}
                                />
                            </div>
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
                    <BenefitsForm benefits={benefits} />
                </div>
                <div className='sticky top-[96px] hidden shrink-0 basis-[380px] min-[920px]:!visible min-[920px]:!block'>
                    <TierDetailPreview isFreeTier={isFreeTier} tier={formState} />
                </div>
            </div>
        </Modal>
    );
};

// ─── Router Wrapper ───────────────────────────────────────────────────────────

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

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Portal plans logic** | Inline mutation with splice/push | `usePortalPlans` hook with `syncFreeTierVisibility` |
| **Tier status confirmation** | Inline in component | `useTierStatusConfirmation` hook |
| **Left button props** | Imperative `if/else` block | Pure `buildLeftButtonProps` function |
| **Prices section** | ~40 lines inline JSX | `PricesField` component |
| **Free trial section** | ~25 lines inline JSX | `FreeTrialField` component |
| **Benefits section** | ~50 lines inline JSX | `BenefitsForm` component |
| **Validators** | Closed over `formState` | Accept `state` as parameter (more testable) |
| **`toggleFreeTrial`** | Duplicated `updateForm` calls | Single call with ternary |
| **`TierDetailModal`** | Redundant `let tier` + `useEffect` guard | Cleaner single-expression `tier` derivation |