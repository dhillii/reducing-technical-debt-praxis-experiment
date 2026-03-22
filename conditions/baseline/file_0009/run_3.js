# Refactored Tier Detail Modal

Here's the refactored code with reduced complexity through extraction of custom hooks, smaller components, and utility functions:

## Custom Hooks

```typescript
// hooks/useTierForm.ts
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type Tier, useAddTier, useEditTier} from '@tryghost/admin-x-framework/api/tiers';
import {useEditSettings} from '@tryghost/admin-x-framework/api/settings';
import {validateCurrencyAmount} from '../../../../utils/currency';
import {currencies} from '../../../../utils/currency';
import {type TierFormState} from '../TierDetailModal';

const buildInitialState = (tier?: Tier): TierFormState => ({
    ...(tier || {}),
    trial_days: tier?.trial_days?.toString() || '',
    currency: tier?.currency || currencies[0].isoCode,
    visibility: tier?.visibility || 'none',
    welcome_page_url: tier?.welcome_page_url || null
});

const buildValidators = (formState: TierFormState) => ({
    name: () => (formState.name ? undefined : 'Enter a name for the tier'),
    monthly_price: () => (
        formState.type !== 'free'
            ? validateCurrencyAmount(formState.monthly_price || 0, formState.currency, {allowZero: false})
            : undefined
    ),
    yearly_price: () => (
        formState.type !== 'free'
            ? validateCurrencyAmount(formState.yearly_price || 0, formState.currency, {allowZero: false})
            : undefined
    )
});

const usePortalPlansUpdate = (
    portalPlans: string[],
    editSettings: (settings: {key: string; value: string}[]) => Promise<void>
) => {
    return async (visibility: string) => {
        const isVisible = visibility === 'public';
        const hasFreePlan = portalPlans.includes('free');

        if (hasFreePlan === isVisible) {
            return;
        }

        const updatedPlans = isVisible
            ? [...portalPlans, 'free']
            : portalPlans.filter(plan => plan !== 'free');

        await editSettings([{key: 'portal_plans', value: JSON.stringify(updatedPlans)}]);
    };
};

export const useTierForm = (
    tier: Tier | undefined,
    isFreeTier: boolean,
    portalPlans: string[]
) => {
    const {mutateAsync: updateTier} = useEditTier();
    const {mutateAsync: createTier} = useAddTier();
    const {mutateAsync: editSettings} = useEditSettings();
    const handleError = useHandleError();
    const updatePortalPlans = usePortalPlansUpdate(portalPlans, editSettings);

    const validators = buildValidators;

    const form = useForm<TierFormState>({
        initialState: buildInitialState(tier),
        savingDelay: 500,
        savedDelay: 500,
        onValidate: () => {
            const newErrors: ErrorMessages = {};
            const currentValidators = buildValidators(form.formState);

            Object.entries(currentValidators).forEach(([key, validator]) => {
                newErrors[key as keyof Tier] = validator?.();
            });

            return newErrors;
        },
        onSave: async () => {
            const {trial_days: trialDays, currency, ...rest} = form.formState;
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
                await updatePortalPlans(form.formState.visibility || 'none');
            }
        },
        onSaveError: handleError
    });

    return {form, updateTier, validators};
};
```

```typescript
// hooks/useTierStatusChange.ts
import NiceModal from '@ebay/nice-modal-react';
import {ConfirmationModal, showToast} from '@tryghost/admin-x-design-system';
import {type Tier, useEditTier} from '@tryghost/admin-x-framework/api/tiers';

const TIER_STATUS_CONTENT = {
    archive: {
        title: 'Archive tier',
        okLabel: 'Archive',
        okColor: 'red' as const,
        prompt: (name: string) => (
            <>
                <div className='mb-6'>
                    Members will no longer be able to subscribe to <strong>{name}</strong> and it
                    will be removed from the list of available tiers in portal.
                </div>
                <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
            </>
        )
    },
    reactivate: {
        title: 'Reactivate tier',
        okLabel: 'Reactivate',
        okColor: 'black' as const,
        prompt: (name: string) => (
            <>
                <div className='mb-6'>
                    Reactivating <strong>{name}</strong> will re-enable it as an option in portal
                    and allow new members to subscribe to this tier.
                </div>
                <div>Existing members will remain unchanged.</div>
            </>
        )
    }
};

export const useTierStatusChange = (tier?: Tier) => {
    const {mutateAsync: updateTier} = useEditTier();

    return () => {
        if (!tier) {
            return;
        }

        const action = tier.active ? 'archive' : 'reactivate';
        const content = TIER_STATUS_CONTENT[action];

        NiceModal.show(ConfirmationModal, {
            title: content.title,
            prompt: content.prompt(tier.name || ''),
            okLabel: content.okLabel,
            cancelLabel: 'Cancel',
            okColor: content.okColor,
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
```

```typescript
// hooks/useFreeTrial.ts
import React from 'react';
import {type Tier} from '@tryghost/admin-x-framework/api/tiers';
import {type TierFormState} from '../TierDetailModal';

export const useFreeTrial = (
    tier: Tier | undefined,
    updateForm: (updater: (state: TierFormState) => TierFormState) => void
) => {
    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);

    const toggleFreeTrial = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setHasFreeTrial(isChecked);
        updateForm(state => ({
            ...state,
            trial_days: isChecked ? (tier?.trial_days?.toString() || '7') : '0'
        }));
    };

    return {hasFreeTrial, toggleFreeTrial};
};
```

```typescript
// hooks/useCurrencyValidation.ts
import {useEffect, useRef} from 'react';

export const useCurrencyValidation = (
    currency: string | undefined,
    validators: {
        monthly_price?: () => string | undefined;
        yearly_price?: () => string | undefined;
    }
) => {
    const didInitialRender = useRef(false);

    useEffect(() => {
        if (didInitialRender.current) {
            validators.monthly_price?.();
            validators.yearly_price?.();
        }
        didInitialRender.current = true;
    }, [currency]); // eslint-disable-line react-hooks/exhaustive-deps
};
```

## Sub-Components

```typescript
// components/TierPriceFields.tsx
import React from 'react';
import {CurrencyField, Heading, Select} from '@tryghost/admin-x-design-system';
import {currencySelectGroups} from '../../../../utils/currency';
import {type TierFormState} from '../TierDetailModal';

interface TierPriceFieldsProps {
    formState: TierFormState;
    errors: Record<string, string | undefined>;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
}

export const TierPriceFields: React.FC<TierPriceFieldsProps> = ({
    formState,
    errors,
    updateForm,
    clearError
}) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 items-center justify-between'>
            <Heading level={6}>Prices</Heading>
            <div className='-mr-2 w-[50px]'>
                <Select
                    border={false}
                    containerClassName='font-medium'
                    controlClasses={{menu: 'w-18'}}
                    options={currencySelectGroups()}
                    selectedOption={currencySelectGroups()
                        .flatMap(group => group.options)
                        .find(option => option.value === formState.currency)}
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
);
```

```typescript
// components/TierTrialField.tsx
import React from 'react';
import {TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type TierFormState} from '../TierDetailModal';

interface TierTrialFieldProps {
    hasFreeTrial: boolean;
    formState: TierFormState;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    toggleFreeTrial: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const FREE_TRIAL_HINT = (
    <div className='mt-1'>
        Members will be subscribed at full price once the trial ends.{' '}
        <a className='text-green' href='https://ghost.org/help/free-trials/' rel='noreferrer' target='_blank'>
            Learn more
        </a>
    </div>
);

export const TierTrialField: React.FC<TierTrialFieldProps> = ({
    hasFreeTrial,
    formState,
    updateForm,
    toggleFreeTrial
}) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 flex-col justify-center'>
            <Toggle
                checked={hasFreeTrial}
                label='Add a free trial'
                labelStyle='heading'
                onChange={toggleFreeTrial}
            />
        </div>
        <TextField
            disabled={!hasFreeTrial}
            hint={FREE_TRIAL_HINT}
            placeholder='0'
            rightPlaceholder='days'
            title='Trial days'
            value={formState.trial_days}
            hideTitle
            onChange={e => updateForm(state => ({
                ...state,
                trial_days: e.target.value.replace(/[^\d]/, '')
            }))}
        />
    </div>
);
```

```typescript
// components/TierBenefitsForm.tsx
import React from 'react';
import {Button, Form, Icon, SortableList, TextField} from '@tryghost/admin-x-design-system';

interface TierBenefitsFormProps {
    benefits: ReturnType<typeof import('@tryghost/admin-x-design-system').useSortableIndexedList>;
}

export const TierBenefitsForm: React.FC<TierBenefitsFormProps> = ({benefits}) => (
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
```

## Refactored Main Component

```typescript
// TierDetailModal.tsx
import NiceModal from '@ebay/nice-modal-react';
import React, {useEffect} from 'react';
import TierDetailPreview from './tier-detail-preview';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {Form, Modal, TextField, URLTextField, useSortableIndexedList, type ButtonProps} from '@tryghost/admin-x-design-system';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {type Tier, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {TierBenefitsForm} from './components/TierBenefitsForm';
import {TierPriceFields} from './components/TierPriceFields';
import {TierTrialField} from './components/TierTrialField';
import {useCurrencyValidation} from './hooks/useCurrencyValidation';
import {useFreeTrial} from './hooks/useFreeTrial';
import {useTierForm} from './hooks/useTierForm';
import {useTierStatusChange} from './hooks/useTierStatusChange';

export type TierFormState = Partial<Omit<Tier, 'trial_days'>> & {
    trial_days: string;
};

const getLeftButtonProps = (
    tier: Tier | undefined,
    onStatusChange: () => void
): ButtonProps => {
    if (!tier) {
        return {};
    }

    if (tier.active && tier.type !== 'free') {
        return {label: 'Archive tier', color: 'red', link: true, onClick: onStatusChange};
    }

    if (!tier.active) {
        return {label: 'Reactivate tier', color: 'green', link: true, onClick: onStatusChange};
    }

    return {};
};

const getModalTitle = (tier?: Tier): string => {
    if (!tier) {
        return 'New tier';
    }
    return tier.active ? 'Edit tier' : 'Edit archived tier';
};

const TierDetailModalContent: React.FC<{tier?: Tier}> = ({tier}) => {
    const isFreeTier = tier?.type === 'free';

    const {updateRoute} = useRouting();
    const {localSettings, siteData} = useSettingGroup();
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    const portalPlans = JSON.parse(portalPlansJson?.toString() || '[]') as string[];

    const {form, validators} = useTierForm(tier, isFreeTier, portalPlans);
    const {formState, saveState, updateForm, handleSave, errors, clearError, okProps} = form;

    const {hasFreeTrial, toggleFreeTrial} = useFreeTrial(tier, updateForm);
    const confirmTierStatusChange = useTierStatusChange(tier);

    useCurrencyValidation(formState.currency, validators(formState));

    const benefits = useSortableIndexedList({
        items: formState.benefits || [],
        setItems: newBenefits => updateForm(state => ({...state, benefits: newBenefits})),
        blank: '',
        canAddNewItem: item => !!item
    });

    return (
        <Modal
            afterClose={() => updateRoute('tiers')}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            leftButtonProps={getLeftButtonProps(tier, confirmTierStatusChange)}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size='lg'
            testId='tier-detail-modal'
            title={getModalTitle(tier)}
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
                                <TierPriceFields
                                    clearError={clearError}
                                    errors={errors}
                                    formState={formState}
                                    updateForm={updateForm}
                                />
                                <TierTrialField
                                    formState={formState}
                                    hasFreeTrial={hasFreeTrial}
                                    toggleFreeTrial={toggleFreeTrial}
                                    updateForm={updateForm}
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
                    <TierBenefitsForm benefits={benefits} />
                </div>
                <div className='sticky top-[96px] hidden shrink-0 basis-[380px] min-[920px]:!visible min-[920px]:!block'>
                    <TierDetailPreview isFreeTier={isFreeTier} tier={formState} />
                </div>
            </div>
        </Modal>
    );
};

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

## Key Improvements

| Concern | Before | After |
|---|---|---|
| **Component size** | Single 300+ line component | Main component ~100 lines |
| **Responsibilities** | Mixed form logic, UI, and side effects | Separated into focused hooks and components |
| **Status change logic** | Inline with duplicated strings | Extracted to `useTierStatusChange` with a config object |
| **Portal plans update** | Nested conditionals with mutation | Extracted to `usePortalPlansUpdate` with clear logic |
| **Free trial toggle** | Inline state + handler | Extracted to `useFreeTrial` hook |
| **Currency validation** | Inline `useEffect` | Extracted to `useCurrencyValidation` hook |
| **Left button props** | Nested `if/else` blocks | Pure `getLeftButtonProps` function |
| **Modal title** | Ternary chain | Pure `getModalTitle` function |
| **Price/trial fields** | Large inline JSX blocks | `TierPriceFields` and `TierTrialField` components |
| **Benefits form** | Large inline JSX block | `TierBenefitsForm` component |