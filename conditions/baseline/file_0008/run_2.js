```tsx
import OffersRetention from './offers-retention';
import {
    Button,
    ButtonGroup,
    Icon,
    Modal,
    Popover,
    Tooltip,
    type ButtonProps,
    type Tab,
    TabView,
    showToast
} from '@tryghost/admin-x-design-system';
import {LucideIcon} from '@tryghost/shade';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {numberWithCommas} from '../../../../utils/helpers';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';

export type OfferType = 'percent' | 'fixed' | 'trial';
type StatusFilter = 'active' | 'archived';

const SORT_OPTIONS = [
    {id: 'date-added', label: 'Date added'},
    {id: 'name', label: 'Name'},
    {id: 'redemptions', label: 'Redemptions'}
] as const;

const OFFERS_TABS: Tab[] = [
    {id: 'signup', title: 'Signup'},
    {id: 'retention', title: 'Retention'}
];

// --- Utility functions ---

export const createRedemptionFilterUrl = (id: string): string => {
    const filterValue = `offer_redemptions:[${id}]`;
    return `/ghost/#/members?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string => {
    const map: Record<string, string> = {
        once: 'First payment',
        repeating: 'Repeating',
        forever: 'Forever'
    };
    return map[duration] ?? duration;
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const formatPrice = (currency: string, price: number): string =>
    getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(price)));

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): {discountColor: string; discountOffer: string; originalPriceWithCurrency: string; updatedPriceWithCurrency: string} => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    let updatedPrice = originalPrice;
    let discountColor = '';
    let discountOffer = '';
    let originalPriceWithCurrency = formatPrice(currency, originalPrice);

    switch (type) {
    case 'percent':
        discountColor = 'text-green';
        discountOffer = `${amount}% off`;
        updatedPrice = originalPrice - (originalPrice * amount) / 100;
        break;
    case 'fixed':
        discountColor = 'text-blue';
        discountOffer = `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;
        updatedPrice = originalPrice - amount;
        break;
    case 'trial':
        discountColor = 'text-pink';
        discountOffer = `${amount} days free`;
        originalPriceWithCurrency = '';
        break;
    }

    const updatedPriceWithCurrency = formatPrice(currency, Math.max(0, updatedPrice));

    return {discountColor, discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency};
};

// --- Sub-components ---

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement>) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(`${getHomepageUrl(siteData!)}${offerCode}`);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <Tooltip
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5'
            content={isCopied ? 'Copied' : 'Copy link'}
            size='sm'
        >
            <Button
                color='clear'
                hideLabel={true}
                icon={isCopied ? 'check-circle' : 'hyperlink-circle'}
                iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'}
                label={isCopied ? 'Copied' : 'Copy'}
                unstyled={true}
                onClick={handleCopyClick}
            />
        </Tooltip>
    );
};

export const EmptyState: React.FC<{
    title?: string;
    description: string;
    buttonAction: () => void;
    buttonLabel: string;
}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className='mt-6' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

const OffersFilterPopover: React.FC<{
    statusFilter: StatusFilter;
    setStatusFilter: (status: StatusFilter) => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}> = ({statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => (
    <Popover
        position='end'
        trigger={
            <button className='flex cursor-pointer items-center justify-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800' type='button'>
                <LucideIcon.ListFilter className='text-grey-700' size={16} strokeWidth={1.5} />
            </button>
        }
    >
        <div className='flex min-w-[220px] flex-col'>
            <SectionHeader label='Status' />
            <div className='flex flex-col py-1'>
                {(['active', 'archived'] as const).map(status => (
                    <FilterButton
                        key={status}
                        isSelected={statusFilter === status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        onClick={() => setStatusFilter(status)}
                    />
                ))}
            </div>
            <SectionHeader label='Sort by' withTopBorder />
            <div className='flex flex-col py-1'>
                {SORT_OPTIONS.map(item => (
                    <div key={item.id} className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'>
                        <button
                            className='flex w-full cursor-pointer items-center px-8 py-1.5 pr-12 text-left text-sm'
                            type='button'
                            onClick={() => onSortChange(item.id)}
                        >
                            {sortOption === item.id && <Icon className='absolute left-2' name='check' size='xs' />}
                            {item.label}
                        </button>
                        {sortOption === item.id && (
                            <button
                                className='absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-grey-300 dark:hover:bg-grey-700'
                                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                type='button'
                                onClick={onDirectionChange}
                            >
                                <Icon name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size='xs' />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </Popover>
);

const SectionHeader: React.FC<{label: string; withTopBorder?: boolean}> = ({label, withTopBorder}) => (
    <div className={`cursor-default select-none p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 ${withTopBorder ? 'border-y border-y-grey-200 dark:border-grey-800' : 'border-b border-b-grey-200 dark:border-b-grey-800'}`}>
        {label}
    </div>
);

const FilterButton: React.FC<{isSelected: boolean; label: string; onClick: () => void}> = ({isSelected, label, onClick}) => (
    <button
        className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
        type='button'
        onClick={onClick}
    >
        {isSelected && <Icon className='absolute left-2' name='check' size='xs' />}
        {label}
    </button>
);

const OfferTableRow: React.FC<{
    offer: ReturnType<typeof useBrowseOffers>['data']['offers'][number];
    offerTier: Tier;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, onEdit}) => {
    const isTierArchived = offerTier.active === false;
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(
        offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier
    );
    const offerId = offer.id ?? '';
    const handleEdit = isTierArchived ? () => {} : () => onEdit(offerId);
    const cellClass = `${isTierArchived ? 'opacity-50' : ''} p-0`;
    const linkClass = `block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`;

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={cellClass}>
                <a className={`${linkClass} pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span><br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={linkClass} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={linkClass} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>{' '}
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>
            <td className={`${cellClass} w-[120px] whitespace-nowrap text-sm`}>
                <a
                    className={`${linkClass} ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : () => {}}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>
            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

const SignupTabHeader: React.FC<{
    hasOffers: boolean;
    statusFilter: StatusFilter;
    setStatusFilter: (s: StatusFilter) => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (o: string) => void;
    onDirectionChange: () => void;
}> = ({hasOffers, statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => {
    const filterPopover = (
        <OffersFilterPopover
            setStatusFilter={setStatusFilter}
            sortDirection={sortDirection}
            sortOption={sortOption}
            statusFilter={statusFilter}
            onDirectionChange={onDirectionChange}
            onSortChange={onSortChange}
        />
    );

    if (hasOffers) {
        return (
            <div className='flex items-center'>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Price</span>
                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
                <span className='flex w-[80px] items-center justify-end'>{filterPopover}</span>
            </div>
        );
    }

    return <div className='flex items-center'>{filterPopover}