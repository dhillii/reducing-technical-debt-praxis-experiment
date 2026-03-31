```typescript
import NiceModal from '@ebay/nice-modal-react';
import React, { useEffect, useRef } from 'react';
import TierDetailPreview from './tier-detail-preview';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {
    Button,
    type ButtonProps,
    ConfirmationModal,
    CurrencyField,
    Form,
    Heading,
    Icon,
    Modal,
    Select,
    SortableList,
    TextField,
    Toggle,
    URLTextField,
    showToast,
    useSortableIndexedList
} from '@tryghost/admin-x-design-system';
import { type ErrorMessages, useForm, useHandleError } from '@tryghost/admin-x-framework/hooks';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { type Tier, useAddTier, useBrowseTiers, useEditTier } from '@tryghost/admin-x-framework/api/tiers';
import { currencies, currencySelectGroups, validateCurrencyAmount } from '../../../../utils/currency';
import { getSettingValues, useEditSettings } from '@tryghost/admin-x-framework/api/settings';

export type TierFormState = Partial<Omit<Tier, 'trial_days'>> & {
    trial_days: string;
};

// ============================================================================
// Validators
// ============================================================================

const createValidators = (formState: TierFormState, isFreeTier: boolean) => ({
    name: () => (formState.name ? undefined : 'Enter a name for the tier'),
    monthly_price: () =>
        isFreeTier ? undefined : validateCurrencyAmount(formState.monthly_price || 0, formState.currency, { allowZero: false }),
    yearly_price: () =>
        isFreeTier ? undefined : validateCurrencyAmount(formState.yearly_price || 0, formState.currency, { allowZero: false })
});

// ============================================================================
// Portal Plans Management
// ============================================================================

const updatePortalPlans = async (
    portalPlans: string[],
    isVisible: boolean,
    editSettings: (settings: Array<{ key: string; value: string }>) => Promise<void>
) => {
    const hasFree = portalPlans.includes('free');
    let shouldSave = false;

    if (hasFree && !isVisible) {
        portalPlans.splice(portalPlans.indexOf('free'), 1);
        shouldSave = true;
    } else if (!hasFree && isVisible) {
        portalPlans.push('free');
        shouldSave = true;
    }

    if (shouldSave) {
        await editSettings([{ key: 'portal_plans', value: JSON.stringify(portalPlans) }]);
    }
};

// ============================================================================
// Tier Status Confirmation
// ============================================================================

const showTierStatusConfirmation = (
    tier: Tier,
    updateTier: (tier: Tier) => Promise<void>
) => {
    const isArchiving = tier.active;
    const title = isArchiving ? 'Archive tier' : 'Reactivate tier';
    const prompt = isArchiving ? (
        <>
            <div className='mb-6'>
                Members will no longer be able to subscribe to <strong>{tier.name}</strong> and it will be removed from the list of available tiers in portal.
            </div>
            <div>Existing members on this tier will remain unchanged. Offers using this tier will be disabled.</div>
        </>
    ) : (
        <>
            <div className='mb-6'>
                Reactivating <strong>{tier.name}</strong> will re-enable it as an option in portal and allow new members to subscribe to this tier.
            </div>
            <div>Existing members will remain unchanged.</div>
        </>
    );

    NiceModal.show(ConfirmationModal, {
        title,
        prompt,
        okLabel: isArchiving ? 'Archive' : 'Reactivate',
        cancelLabel: 'Cancel',
        okColor: isArchiving ? 'red' : 'black',
        onOk: (confirmModal) => {
            updateTier({ ...tier, active: !tier.active });
            confirmModal?.remove();
            showToast({
                type: 'success',
                title: `Tier ${isArchiving ? 'archived' : 'reactivated'}`
            });
        }
    });
};

// ============================================================================
// Left Button Props Builder
// ============================================================================

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

// ============================================================================
// Modal Title Builder
// ============================================================================

const getModalTitle = (tier: Tier | undefined): string => {
    if (!tier) return 'New tier';
    return tier.active ? 'Edit tier' : 'Edit archived tier';
};

// ============================================================================
// Benefits Section Component
// ============================================================================

const BenefitsSection: React.FC<{
    benefits: ReturnType<typeof useSortableIndexedList>;
}> = ({ benefits }) => (
    <Form gap='none' title='Benefits' grouped>
        <div className='-mt-3'>
            <SortableList
                items={benefits.items}
                itemSeparator={false}
                renderItem={({ id, item }) => (
                    <div className='relative flex w-full items-center gap-5'>
                        <div className='absolute left-[-32px] top-[7px] flex size-6 items-center justify-center bg-white group-hover:hidden dark:bg-black'>
                            <Icon name='check' size='sm' />
                        </div>
                        <TextField
                            maxLength={191}
                            value={item}
                            onChange={(e) => benefits.updateItem(id, e.target.value)}
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
                onChange={(e) => benefits.setNewItem(e.target.value)}
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

// ============================================================================
// Pricing Section Component
// ============================================================================

const PricingSection: React.FC<{
    formState: TierFormState;
    hasFreeTrial: boolean;
    errors: ErrorMessages;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
    toggleFreeTrial: (e: React.ChangeEvent<HTMLInputElement>) => void;
    tier?: Tier;
}> = ({ formState, hasFreeTrial, errors, updateForm, clearError, toggleFreeTrial, tier }) => (
    <div className='flex flex-col gap-10 md:flex-row'>
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
                            .flatMap((group) => group.options)
                            .find((option) => option.value === formState.currency)}
                        size='xs'
                        clearBg
                        isSearchable
                        onSelect={(option) => updateForm((state) => ({ ...state, currency: option?.value }))}
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
                    onBlur={(event) => {
                        if (event.target.value === '') {
                            updateForm((state) => ({ ...state, monthly_price: 0 }));
                        }
                    }}
                    onChange={(price) => updateForm((state) => ({ ...state, monthly_price: price }))}
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
                    onBlur={(event) => {
                        if (event.target.value === '') {
                            updateForm((state) => ({ ...state, yearly_price: 0 }));
                        }
                    }}
                    onChange={(price) => updateForm((state) => ({ ...state, yearly_price: price }))}
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
                        <a className='text-green' href='https://ghost.org/help/free-trials/' rel='noreferrer' target='_blank'>
                            Learn more
                        </a>
                    </div>
                }
                placeholder='0'
                rightPlaceholder='days'
                title='Trial days'
                value={formState.trial_days}
                hideTitle
                onChange={(e) => updateForm((state) => ({ ...state, trial_days: e.target.value.replace(/[^\d]/, '') }))}
            />
        </div>
    </div>
);

// ============================================================================
// Basic Info Section Component
// ============================================================================

const BasicInfoSection: React.FC<{
    formState: TierFormState;
    isFreeTier: boolean;
    errors: ErrorMessages;
    updateForm: (updater: (state: TierFormState) => TierFormState) => void;
    clearError: (key: string) => void;
    hasFreeTrial: boolean;
    toggleFreeTrial: (e: React.ChangeEvent<HTMLInputElement>) => void;
    siteData?: { url?: string };
    tier?: Tier;
}> = ({
    formState,
    isFreeTier,
    errors,
    updateForm,
    clearError,
    hasFreeTrial,
    toggleFreeTrial,
    siteData,
    tier
}) => (
    <>
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
                onChange={(e) => updateForm((state) => ({ ...state, name: e.target.value }))}
                onKeyDown={() => clearError('name')}
            />
            <TextField
                autoComplete='off'
                autoFocus={isFreeTier}
                maxLength={191}
                placeholder={isFreeTier ? 'Free preview' : 'Full access to premium content'}
                title='Description'
                value={formState.description || ''}
                onChange={(e) => updateForm((state) => ({ ...state, description: e.target.value }))}
            />
            {!isFreeTier && (
                <>
                    <PricingSection
                        formState={formState}
                        hasFreeTrial={hasFreeTrial}
                        errors={errors}
                        updateForm={updateForm}
                        clearError={clearError}
                        toggleFreeTrial={toggleFreeTrial}
                        tier={tier}
                    />
                </>
            )}
            <URLTextField
                baseUrl={siteData?.url}
                hint={`Redirect to this URL after signup ${isFreeTier ? '' : ' for premium membership'}`}
                maxLength={2000}
                placeholder={siteData?.url}
                title='Welcome page'
                value={formState.welcome_page_url || null}
                nullable
                transformPathWithoutSlash
                onChange={(value) => updateForm((state) => ({ ...state, welcome_page_url: value || null }))}
            />
        </Form>
    </>
);

// ============================================================================
// Main Modal Content Component
// ============================================================================

const TierDetailModalContent: React.FC<{ tier?: Tier }> = ({ tier }) => {
    const isFreeTier = tier?.type === 'free';
    const { updateRoute } = useRouting();
    const { mutateAsync: updateTier } = useEditTier();
    const { mutateAsync: createTier } = useAddTier();
    const { mutateAsync: editSettings } = useEditSettings();
    const [hasFreeTrial, setHasFreeTrial] = React.useState(!!tier?.trial_days);
    const handleError = useHandleError();
    const { localSettings, siteData } = useSettingGroup();
    const [portalPlansJson] = getSettingValues(localSettings, ['portal_plans']) as string[];
    const portalPlans = JSON.parse(portalPlansJson?.toString() || '[]') as string[];
    const didInitialRender = useRef(false);

    const { formState, saveState, updateForm, handleSave, errors, clearError, okProps } = useForm<TierFormState>({
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

            Object.entries(validators).forEach