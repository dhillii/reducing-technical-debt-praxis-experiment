function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const isDisabled = useMemo(() => {
        return (action === 'signup:running') || isCookiesDisabled();
    }, [action]);

    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site});
    const currencySymbol = getCurrencySymbol(products?.[1]?.monthlyPrice?.currency) || '$';
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site'});
    const showProduct = !(hasOnlyFree && !freeProductDescription && !freeBenefits.length);
    const isEmpty = !freeProductDescription && !freeBenefits.length;

    if (!showProduct) {
        return null;
    }

    const cardClass = `${selectedProduct === 'free' ? 'checked ' : ''}gh-portal-product-card free${hasOnlyFree ? ' only-free' : ''}`;
    const description = isEmpty ? 'Free preview' : freeProductDescription;

    return (
        <div className={cardClass} onClick={(e) => {
            e.stopPropagation();
            setSelectedProduct('free');
        }} data-test-tier="free">
            <ProductCardHeader product={product} description={description} currencySymbol={currencySymbol} hasOnlyFree={hasOnlyFree} />
            <ProductCardDetails product={product} description={description} hasOnlyFree={hasOnlyFree} />
            {hasOnlyFree || <ProductCardFooter disabled={isDisabled} error={error} handleChooseSignup={handleChooseSignup} selectedProduct={selectedProduct} />}
        </div>
    );
}

function ProductCardHeader({product, description, currencySymbol, hasOnlyFree}) {
    return (
        <div className='gh-portal-product-card-header'>
            <h4 className="gh-portal-product-name">{getFreeTierTitle({site: product})}</h4>
            {!hasOnlyFree && (
                <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                    <div className="gh-portal-product-price">
                        <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                        <span className="amount" data-testid="product-amount">0</span>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProductCardDetails({product, description, hasOnlyFree}) {
    return (
        <div className='gh-portal-product-card-details'>
            <div className='gh-portal-product-card-detaildata'>
                {description && <div className="gh-portal-product-description" data-testid="product-description">{description}</div>}
                <ProductBenefitsContainer product={product} />
            </div>
        </div>
    );
}

function ProductCardFooter({disabled, error, handleChooseSignup, selectedProduct}) {
    return (
        <div className='gh-portal-btn-product'>
            <button
                data-test-button='select-tier'
                className='gh-portal-btn'
                disabled={disabled}
                onClick={(e) => {
                    handleChooseSignup(e, 'free');
                }}>
                {selectedProduct === 'free' && disabled ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose')}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );
}