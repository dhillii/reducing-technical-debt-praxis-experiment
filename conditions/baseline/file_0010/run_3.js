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

// Validators
const createValidators = (formState: TierFormState, isFreeTier: boolean) => ({
    name: () => (formState.name ? undefined : 'Enter a name for the tier'),
    monthly_price: () => (formState.type !== 'free' ? validateCurrencyAmount(formState.monthly_price || 0, formState.currency, {allowZero: false}) : undefined),
    yearly_price: () => (formState.type !== 'free' ? validateCurrencyAmount(formState.yearly_price || 0, formState.currency, {allowZero: false}) : undefined)
});

// Portal plans management
const updatePortalPlans = async (
    isFreeTier: boolean,
    visibility: string,
    portalPlans: string[],
    editSettings: (settings: Array<{key: string; value: string}>) => Promise<void>
) => {
    if (!isFreeTier) return;

    const visible = visibility === 'public';
    const hasFreePlan = portalPlans.includes('free');
    let shouldSave = false;

    if (hasFreePlan && !visible) {
        portalPlans.splice(portalPlans.indexOf('free'), 1);
        shouldSave = true;
    } else if (!hasFreePlan && visible) {
        portalPlans.push('free');
        shouldSave = true;
    }

    if (shouldSave) {
        await editSettings([{key: 'portal_plans', value: JSON.stringify(portalPlans)}]);
    }
};

// Tier status confirmation
const showTierStatusConfirmation = (tier: Tier, onConfirm: () => void) => {
    const isActive = tier.active;
    const promptTitle = isActive ? 'Archive tier' : 'Reactivate tier';
    const prompt = isActive ? (
        <>
            <div className='mb-6'>Members will no longer be able to subscribe to <strong>{tier.name}</strong> and it will be removed from the list of available tiers in portal.</div>
            <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
        </>
    ) : (
        <>
            <div className='mb-6'>Reactivating <strong>{tier.name}</strong> will re-enable it as an option in portal and allow new members to subscribe to this tier.</div>
            <div>Existing members will remain unchanged.</div>
        </>
    );

    NiceModal.show(ConfirmationModal, {
        title: promptTitle,
        prompt: prompt,
        okLabel: isActive ? 'Archive' : 'Reactivate',
        cancelLabel: 'Cancel',
        okColor: isActive ? 'red' : 'black',
        onOk: (confirmModal) => {
            onConfirm();
            confirmModal?.remove();
            showToast({
                type: 'success',
                title: `Tier ${isActive ? 'archived' : 'reactivated'}`
            });
        }
    });
};

// Get left button props based on tier status
const getLeftButtonProps = (tier: Tier | undefined, onStatusChange: () => void): ButtonProps => {
    if (!tier) return {};

    if (tier.active && tier.type !== 'free') {
        return {
            label: 'Archive tier',
            color: 'red',
            link: true,
            onClick: onStatusChange
        };
    }

    if (!tier.active) {
        return {
            label: 'Reactivate tier',
            color: 'green',
            link: true,
            onClick: onStatusChange
        };
    }

    return {};
};

// Get modal title
const getModalTitle = (tier: Tier | undefined): string => {
    if (!tier) return 'New tier';
    return tier.active ? 'Edit tier' : 'Edit archived tier';
};

// Benefits section component
const BenefitsSection: React.FC<{benefits: ReturnType<typeof useSortableIndexedList>}> = ({benefits}) => (
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
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        benefits.addItem();
                    }
                }}
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

// Pricing section component
const PricingSection: React.FC<{
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
                    onBlur={event => ((event.target.value === '') ? updateForm(state => ({...state, monthly_price: 0})) : null)}
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
                    onBlur={event => ((event.target.value === '') ? updateForm(state => ({...state, yearly_price: 0})) : null)}
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
                hint={<div className='mt-1'>
                    Members will be subscribed at full price once the trial ends. <a className='text-green' href="https://ghost.org/help/free-trials/" rel="noreferrer" target="_blank">Learn more</a>
                </div>}
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

const TierDetailModalContent: React.FC<{tier?: Tier}> = ({tier}) => {
    const isFreeTier = tier?.type === 'free';
    const {updateRoute} = useRouting();
    const {mutateAsync: updateTier} = useEditTier();
    const {mutateAsync: createTier} = useAddTier();
    const {mutateAsync: editSettings} = useEditSettings();
    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);
    const handleError = useHandleError();
    const {localSettings, siteData} = useSettingGroup();
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    const portalPlans = JSON.parse(portalPlansJson?.toString() || '[]') as string[];
    const didInitialRender = useRef(false);

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
            const validators = createValidators(formState, isFreeTier);
            const newErrors: ErrorMessages = {};

            Object.entries(validators).forEach(([key, validator]) => {
                newErrors[key as keyof Tier] = validator?.();
            });

            return newErrors;
        },
        onSave: async () => {
            const {trial_days: trialDays, currency, ...rest} = formState;
            const values: Partial<Tier> = rest;

            values.benefits = values.benefits?.filter(benefit => benefit);

            if (!isFreeTier) {
                values.currency = currency;
                values.trial_days = parseInt(trialDays);
            }

            if (tier?.id) {
                await updateTier({...tier, ...values});
            } else {
                await createTier(values);
            }

            await updatePortalPlans(isFreeTier, formState.visibility || 'none', portalPlans, editSettings);
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
        if (e.target.checked) {
            setHasFreeTrial(true);
            updateForm(state => ({...state, trial_days: tier?.trial_days ? tier?.trial_days.toString() : '7'}));
        } else {
            setHasFreeTrial(false);
            updateForm(state => ({...state, trial_days: '0'}));
        }
    };

    const confirmTierStatusChange = () => {
        if (tier) {
            showTierStatusConfirmation(tier, () => {
                updateTier({...tier, active: !tier.active});
            });
        }
    };

    useEffect(() => {
        if (didInitialRender.current) {
            const validators = createValidators(formState, isFreeTier);
            validators.monthly_price?.();
            validators.yearly_price?.();
        }
        didInitialRender.current = true;
    }, [formState.currency, formState, isFreeTier]);

    const leftButtonProps = getLeftButtonProps(tier, confirmTierStatusChange);

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
            title={getModalTitle(tier)}
            stickyFooter
            onOk={async () => {
                await handleSave({fakeWhenUnchanged: true});
            }}
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
                            value={formState