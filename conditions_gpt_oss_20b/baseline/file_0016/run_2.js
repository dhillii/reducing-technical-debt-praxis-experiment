function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const disabled = action === 'signup:running' || isCookiesDisabled();

    const currencySymbol = (products && products[1])
        ? getCurrencySymbol(products[1].monthlyPrice.currency)
        : '$';

    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    let freeProductDescription = getFreeTierDescription({site});

    if (hasOnlyFree && (!freeProductDescription || freeBenefits.length === 0)) {
        return null;
    }

    if (!freeProductDescription && freeBenefits.length === 0) {
        freeProductDescription = 'Free preview';
    }

    let cardClass = 'gh-portal-product-card free';
    if (selectedProduct === 'free') cardClass += ' checked';
    if (hasOnlyFree) cardClass += ' only-free';

    const buttonContent = (selectedProduct === 'free' && disabled)
        ? <LoaderIcon className='gh-portal-loadingicon' />
        : t('Choose');

    return (
        <div className={cardClass} onClick={e => { e.stopPropagation(); setSelectedProduct('free'); }} data-test-tier="free">
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                )}
            </div>
            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    {freeProductDescription && (
                        <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                    )}
                    <ProductBenefitsContainer product={getFreeProduct({site})} />
                </div>
                {!hasOnlyFree && (
                    <div className='gh-portal-btn-product'>
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            disabled={disabled}
                            onClick={e => handleChooseSignup(e, 'free')}
                        >
                            {buttonContent}
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}