Here's the refactored code with reduced complexity through extraction of custom hooks, smaller components, and helper functions:

```typescript
import NiceModal from '@ebay/nice-modal-react';
import React, { useEffect, useRef } from 'react';
import TierDetailPreview from './tier-detail-preview';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {
    Button, type ButtonProps, ConfirmationModal, CurrencyField,
    Form, Heading, Icon, Modal, Select, SortableList, TextField,
    Toggle, URLTextField, showToast, useSortableIndexedList
} from '@tryghost/admin-x-design-system';
import { type ErrorMessages, useForm, useHandleError } from '@tryghost/admin-x-framework/hooks';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { type Tier, useAddTier, useBrowseTiers, useEditTier } from '@tryghost/admin-x-framework/api/tiers';
import { currencies, currencySelectGroups, validateCurrencyAmount } from '../../../../utils/currency';
import { getSettingValues, useEditSettings } from '@tryghost/admin-x-framework/api/settings';

export type TierFormState = Partial<Omit<Tier, 'trial_days'>> & {
    trial_days: string;
};

// ─── Helper Functions ────────────────────────────────────────────────────────

const getInitialFormState = (tier?: Tier): TierFormState => ({
    ...(tier || {}),
    trial_days: tier?.trial_days?.toString() || '',
    currency: tier?.currency || currencies[0].isoCode,
    visibility: tier?.visibility || 'none',
    welcome_page_url: tier?.welcome_page_url || null
});

const getModalTitle = (tier?: Tier): string => {
    if (!tier) return 'New tier';
    return tier.active ? 'Edit tier' : 'Edit archived tier';
};

const getLeftButtonProps = (
    tier: Tier | undefined,
    onConfirm: () => void
): ButtonProps => {
    if (!tier) return {};

    if (tier.active && tier.type !== 'free') {
        return { label: 'Archive tier', color: 'red', link: true, onClick: onConfirm };
    }

    if (!tier.active) {
        return { label: 'Reactivate tier', color: 'green', link: true, onClick: onConfirm };
    }

    return {};
};

const buildConfirmationContent = (tier: Tier) => {
    if (tier.active) {
        return {
            title: 'Archive tier',
            okLabel: 'Archive',
            okColor: 'red' as const,
            prompt: (
                <>
                    <div className='mb-6'>
                        Members will no longer be able to subscribe to <strong>{tier.name}</strong> and
                        it will be removed from the list of available tiers in portal.
                    </div>
                    <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
                </>
            )
        };
    }

    return {
        title: 'Reactivate tier',
        okLabel: 'Reactivate',
        okColor: 'black' as const,
        prompt: (
            <>
                <div className='mb-6'>
                    Reactivating <strong>{tier.name}</strong> will re-enable it as an option in portal
                    and allow new members to subscribe to this tier.
                </div>
                <div>Existing members will remain unchanged.</div>
            </>
        )
    };
};

// ─── Custom Hooks ────────────────────────────────────────────────────────────

const usePortalPlans = () => {
    const { localSettings } = useSettingGroup();
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    return JSON.parse(portalPlansJson?.toString() || '[]') as string[];
};

const useFreeTierPortalSync = (
    isFreeTier: boolean,
    portalPlans: string[],
    editSettings: (settings: { key: string; value: string }[]) => Promise<void>
) => {
    return async (visibility: string) => {
        if (!isFreeTier) return;

        const visible = visibility === 'public';
        const hasFree = portalPlans.includes('free');

        if (hasFree === visible) return;

        const updatedPlans = visible
            ? [...portalPlans, 'free']
            : portalPlans.filter(p => p !== 'free');

        await editSettings([{ key: 'portal_plans', value: JSON.stringify(updatedPlans) }]);
    };
};

const useTierForm = (tier: Tier | undefined, isFreeTier: boolean) => {
    const { mutateAsync: updateTier } = useEditTier();
    const { mutateAsync: createTier } = useAddTier();
    const { mutateAsync: editSettings } = useEditSettings();
    const handleError = useHandleError();
    const portalPlans = usePortalPlans();
    const syncPortalPlans = useFreeTierPortalSync(isFreeTier, portalPlans, editSettings);

    const validators = {
        name: (formState: TierFormState) =>
            formState.name ? undefined : 'Enter a name for the tier',
        monthly_price: (formState: TierFormState) =>
            formState.type !== 'free'
                ? validateCurrencyAmount(formState.monthly_price || 0, formState.currency, { allowZero: false })
                : undefined,
        yearly_price: (formState: TierFormState) =>
            formState.type !== 'free'
                ? validateCurrencyAmount(formState.yearly_price || 0, formState.currency, { allowZero: false })
                : undefined
    };

    const form = useForm<TierFormState>({
        initialState: getInitialFormState(tier),
        savingDelay: 500,
        savedDelay: 500,
        onValidate: (formState) => {
            const newErrors: ErrorMessages = {};
            Object.entries(validators).forEach(([key, validator]) => {
                newErrors[key as keyof Tier] = validator(formState);
            });
            return newErrors;
        },
        onSave: async (formState) => {
            const { trial_days: trialDays, currency, ...rest } = formState;
            const values: Partial<Tier> = {
                ...rest,
                benefits: rest.benefits?.filter(Boolean)
            };

            if (!isFreeTier) {
                values.currency = currency;
                values.trial_days = parseInt(trialDays);
            }

            if (tier?.id) {
                await updateTier({ ...tier, ...values });
            } else {
                await createTier(values);
            }

            await syncPortalPlans(formState.visibility || 'none');
        },
        onSaveError: handleError
    });

    return { ...form, updateTier };
};

const useCurrencyValidation = (
    currency: string | undefined,
    validators: Record<string, () => string | undefined>
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

const useTierStatusConfirmation = (
    tier: Tier | undefined,
    updateTier: (tier: Tier) => void
) => {
    return () => {
        if (!tier) return;

        const { title, prompt, okLabel, okColor } = buildConfirmationContent(tier);

        NiceModal.show(ConfirmationModal, {
            title,
            prompt,
            okLabel,
            okColor,
            cancelLabel: 'Cancel',
            onOk: (confirmModal) => {
                updateTier({ ...tier, active: !tier.active });
                confirmModal?.remove();
                showToast({
                    type: 'success',
                    title: `Tier ${tier.active ? 'archived' : 'reactivated'}`
                });
            }
        });
    };
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

const PricesSection: React.FC<{
    formState: TierFormState;
    errors: ErrorMessages;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
}> = ({ formState, errors, updateForm, clearError }) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 items-center justify-between'>
            <Heading level={6}>Prices</Heading>
            <div className='-mr-2 w-[50px]'>
                <Select
                    border={false}
                    containerClassName='font-medium'
                    controlClasses={{ menu: 'w-18' }}
                    options={currencySelectGroups()}
                    selectedOption={currencySelectGroups()
                        .flatMap(group => group.options)
                        .find(option => option.value === formState.currency)}
                    size='xs'
                    clearBg
                    isSearchable
                    onSelect={option => updateForm(state => ({ ...state, currency: option?.value }))}
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
                onBlur={e => e.target.value === '' && updateForm(state => ({ ...state, monthly_price: 0 }))}
                onChange={price => updateForm(state => ({ ...state, monthly_price: price }))}
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
                onBlur={e => e.target.value === '' && updateForm(state => ({ ...state, yearly_price: 0 }))}
                onChange={price => updateForm(state => ({ ...state, yearly_price: price }))}
                onKeyDown={() => clearError('yearly_price')}
            />
        </div>
    </div>
);

const FreeTrialSection: React.FC<{
    formState: TierFormState;
    hasFreeTrial: boolean;
    onToggle: (e: React.ChangeEvent<HTMLInputElement>) => void;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
}> = ({ formState, hasFreeTrial, onToggle, updateForm }) => (
    <div className='basis-1/2'>
        <div className='mb-1 flex h-6 flex-col justify-center'>
            <Toggle checked={hasFreeTrial} label='Add a free trial' labelStyle='heading' onChange={onToggle} />
        </div>
        <TextField
            disabled={!hasFreeTrial}
            hint={
                <div className='mt-1'>
                    Members will be subscribed at full price once the trial ends.{' '}
                    <a className='text-green' href="https://ghost.org/help/free-trials/" rel="noreferrer" target="_blank">
                        Learn more
                    </a>
                </div>
            }
            placeholder='0'
            rightPlaceholder='days'
            title='Trial days'
            value={formState.trial_days}
            hideTitle
            onChange={e => updateForm(state => ({ ...state, trial_days: e.target.value.replace(/[^\d]/, '') }))}
        />
    </div>
);

const BenefitItem: React.FC<{
    id: string;
    item: string;
    onUpdate: (id: string, value: string) => void;
    onRemove: (id: string) => void;
}> = ({ id, item, onUpdate, onRemove }) => (
    <div className='relative flex w-full items-center gap-5'>
        <div className='absolute left-[-32px] top-[7px] flex size-6 items-center justify-center bg-white group-hover:hidden dark:bg-black'>
            <Icon name='check' size='sm' />
        </div>
        <TextField
            maxLength={191}
            value={item}
            onChange={e => onUpdate(id, e.target.value)}
        />
        <Button
            className='absolute right-1 top-1 z-10 opacity-0 group-hover:opacity-100'
            color='grey'
            icon='trash'
            size='sm'
            onClick={() => onRemove(id)}
        />
    </div>
);

const BenefitsForm: React.FC<{
    benefits: ReturnType<typeof useSortableIndexedList>;
}> = ({ benefits }) => (
    <Form gap='none' title='Benefits' grouped>
        <div className='-mt-3'>
            <SortableList
                items={benefits.items}
                itemSeparator={false}
                renderItem={({ id, item }) => (
                    <BenefitItem
                        id={id}
                        item={item}
                        onRemove={benefits.removeItem}
                        onUpdate={benefits.updateItem}
                    />
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

// ─── Main Component ──────────────────────────────────────────────────────────

const TierDetailModalContent: React.FC<{ tier?: Tier }> = ({ tier }) => {
    const isFreeTier = tier?.type === 'free';
    const { updateRoute } = useRouting();
    const { siteData } = useSettingGroup();
    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);

    const { formState, saveState, updateForm, handleSave, errors, clearError, okProps, updateTier } =
        useTierForm(tier, isFreeTier);

    const confirmTierStatusChange = useTierStatusConfirmation(tier, updateTier);

    useCurrencyValidation(formState.currency, {
        monthly_price: () => validateCurrencyAmount(formState.monthly_price || 0, formState.currency, { allowZero: false }),
        yearly_price: () => validateCurrencyAmount(formState.yearly_price || 0, formState.currency, { allowZero: false })
    });

    const benefits = useSortableIndexedList({
        items: formState.benefits || [],
        setItems: newBenefits => updateForm(state => ({ ...state, benefits: newBenefits })),
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
            stickyFooter
            testId='tier-detail-modal'
            title={getModalTitle(tier)}
            onOk={() => handleSave({ fakeWhenUnchanged: true })}
        >
            <div className='-mb-8 mt-8 flex items-start gap-8'>
                <div className='flex grow flex-col gap-8'>
                    <Form marginBottom={false} title='Basic' grouped>
                        <TextField
                            autoComplete='off'
                            autoFocus
                            error={Boolean(errors.name)}
                            hint={errors.name}
                            maxLength={191}
                            placeholder={isFreeTier ? 'Free' : 'Bronze'}
                            title='Name'
                            value={formState.name || ''}
                            onChange={e => updateForm(state => ({ ...state, name: e.target.value }))}
                            onKeyDown={() => clearError('name')}
                        />
                        <TextField
                            autoComplete='off'
                            autoFocus={isFreeTier}
                            maxLength={191}
                            placeholder={isFreeTier ? 'Free preview' : 'Full access to premium content'}
                            title='Description'
                            value={formState.description || ''}
                            onChange={e => updateForm(state => ({ ...state, description: e.target.value }))}
                        />
                        {!isFreeTier && (
                            <div className='flex flex-col gap-10 md:flex-row'>
                                <PricesSection
                                    clearError={clearError}
                                    errors={errors}
                                    formState={formState}
                                    updateForm={updateForm}
                                />
                                <FreeTrialSection
                                    formState={formState}
                                    hasFreeTrial={hasFreeTrial}
                                    updateForm={updateForm}
                                    onToggle={toggleFreeTrial}
                                />
                            </div>
                        )}
                        <URLTextField
                            baseUrl={siteData?.url}
                            hint={`Redirect to this URL after signup${isFreeTier ? '' : ' for premium membership'}`}
                            maxLength={2000}
                            nullable
                            placeholder={siteData?.url}
                            title='Welcome page'
                            transformPathWithoutSlash
                            value={formState.welcome_page_url || null}
                            onChange={value => updateForm(state => ({ ...state, welcome_page_url: value || null }))}
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

const TierDetailModal: React.FC<RoutingModalProps> = ({ params }) => {
    const { data: { tiers, isEnd } = {}, fetchNextPage } = useBrowseTiers();

    const tier = params?.id ? tiers?.find(({ id }) => id === params.id) : undefined;

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

Key refactoring improvements:

1. **Extracted helper functions**: `getInitialFormState`, `getModalTitle`, `getLeftButtonProps`, and `buildConfirmationContent` isolate pure logic from components.

2. **Custom hooks**: 
   - `usePortalPlans` encapsulates portal plan retrieval
   - `useFreeTierPortalSync` isolates the free tier portal sync logic
   - `useTierForm` consolidates all form-related state and logic
   - `useCurrencyValidation` extracts the currency validation side effect
   - `useTierStatusConfirmation` isolates the confirmation modal logic

3. **Sub-components**: `PricesSection`, `FreeTrialSection`, `BenefitItem`, and `BenefitsForm` break down the large render into focused, reusable pieces.

4. **Simplified `TierDetailModal`**: Removed the redundant `let tier` declaration and early `useEffect` guard by computing `tier` directly.

5. **Cleaner validators**: Validators now accept `formState` as a parameter instead of closing over it, making them more testable.