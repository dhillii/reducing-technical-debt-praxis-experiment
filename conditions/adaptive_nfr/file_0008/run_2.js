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

export const createRedemptionFilterUrl = (id: string): string => {
    const filterValue = `offer_redemptions:[${id}]`;
    return `/ghost/#/members?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string => {
    const durationMap: Record<string, string> = {
        once: 'First payment',
        repeating: 'Repeating',
        forever: 'Forever'
    };
    return durationMap[duration] ?? duration;
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

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
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

const FilterPopoverSection: React.FC<{label: string; borderStyle?: string}> = ({label, borderStyle = 'border-b'}) => (
    <div className={`cursor-default select-none ${borderStyle} border-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800`}>
        {label}
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
            <FilterPopoverSection label='Status' />
            <div className='flex flex-col py-1'>
                {(['active', 'archived'] as const).map(status => (
                    <button
                        key={status}
                        className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
                        type='button'
                        onClick={() => setStatusFilter(status)}
                    >
                        {statusFilter === status && <Icon className='absolute left-2' name='check' size='xs' />}
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                ))}
            </div>
            <FilterPopoverSection borderStyle='border-y' label='Sort by' />
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

const OfferRow: React.FC<{
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
    const opacityClass = isTierArchived ? 'opacity-50' : '';
    const cursorClass = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${opacityClass} p-0`}>
                <a className={`block ${cursorClass} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span><br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${cursorClass} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${cursorClass} p-5`} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>{' '}
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${cursorClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : () => {}}
                >
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
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

const ColumnHeader: React.FC<{label: string; className?: string}> = ({label, className = 'w-[220px]'}) => (
    <span className={`${className} px-5 text-xs uppercase text-grey-700`}>{label}</span>
);

const SignupTabHeader: React.FC<{
    hasOffers: boolean;
    filterPopover: React.ReactNode;
}> = ({hasOffers, filterPopover}) => (
    <div className='flex items-center'>
        {hasOffers && (
            <>
                <ColumnHeader label='Terms' />
                <ColumnHeader label='Price' />
                <ColumnHeader label='Redemptions' />
            </>
        )}
        <span className={`flex ${hasOffers ? 'w-[80px]' : ''} items-center justify-end`}>
            {filterPopover}
        </span>
    </div>
);

const RetentionTabHeader: React.FC = () => (
    <div className='flex items-center pt-[3px]'>
        <ColumnHeader label='Terms' />
        <ColumnHeader label='Redemptions' />
        <ColumnHeader label='Status' />
        <span className='w-[80px]' />
    </div>
);

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();