import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button, {ButtonColor, ButtonProps} from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {

    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
    size?: ModalSize;
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    align?: 'center' | 'left' | 'right';

    testId?: string;
    title?: string;
    okLabel?: string;
    okColor?: ButtonColor;
    okLoading?: boolean;
    cancelLabel?: string;
    leftButtonProps?: ButtonProps;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    footer?: boolean | React.ReactNode;
    header?: boolean;
    padding?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile?: boolean;
    afterClose?: () => void;
    children?: React.ReactNode;
    backDrop?: boolean;
    backDropClick?: boolean;
    stickyFooter?: boolean;
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

/** Configuration for modal size styling */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
}

/** Lookup table for modal size configurations */
const SIZE_CONFIG: Record<ModalSize | 'default', SizeConfig> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8'
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]0',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10'
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: 'h-full',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    default: {
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    }
};

/** Get size configuration, falling back to default */
const getSizeConfig = (size: ModalSize): SizeConfig => {
    return SIZE_CONFIG[size] || SIZE_CONFIG.default;
};

/** Determine if modal should have full height */
const shouldHaveFullHeight = (size: ModalSize, height?: 'full' | number): boolean => {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/** Build modal classes based on size and animation state */
const buildModalClasses = (
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    scrolling: boolean,
    sizeConfig: SizeConfig
): string => {
    const alignClass = align === 'center' ? 'mx-auto' : align === 'left' ? 'mr-auto' : 'ml-auto';
    const roundedClass = size !== 'bleed' ? 'rounded' : '';
    const shadowClass = formSheet ? 'shadow-md' : 'shadow-xl';
    
    let animationClass = '';
    if (animate && !formSheet && !animationFinished) {
        animationClass = align === 'center' ? 'animate-modal-in' : align === 'right' ? 'animate-modal-in-from-right' : '';
    }
    if (formSheet && !animationFinished) {
        animationClass = 'animate-modal-in-reverse';
    }
    
    const scrollClass = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';
    
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        alignClass,
        roundedClass,
        shadowClass,
        animationClass,
        scrollClass,
        sizeConfig.modalMaxWidth
    );
};

/** Build backdrop classes */
const buildBackdropClasses = (
    allowBackgroundInteraction: boolean,
    formSheet: boolean,
    sizeConfig: SizeConfig
): string => {
    const pointerClass = allowBackgroundInteraction ? 'pointer-events-none' : '';
    const paddingClass = formSheet ? '' : sizeConfig.backdropPadding;
    
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        pointerClass,
        paddingClass,
        'max-[800px]:!pb-20'
    );
};

/** Build header classes */
const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    sizeConfig: SizeConfig,
    paddingClasses: string
): string => {
    const flexClass = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const stickyClass = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';
    
    return clsx(
        flexClass,
        stickyClass,
        sizeConfig.headerInset,
        paddingClasses,
        'pb-0'
    );
};

/** Build content classes */
const buildContentClasses = (
    paddingClasses: string,
    size: ModalSize,
    height?: 'full' | number
): string => {
    const growClass = shouldHaveFullHeight(size, height) ? 'grow' : '';
    
    return clsx(
        paddingClasses,
        'py-0',
        growClass
    );
};

/** Apply width styling to modal */
const applyWidthStyling = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string
): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    const styles: {width?: string; maxWidth?: string} = {};
    let classes = modalClasses;
    
    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
    } else if (width === 'full') {
        classes = clsx(classes, 'w-full');
    } else if (width === 'toSidebar') {
        classes = clsx(classes, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    }
    
    return {classes, styles};
};

/** Apply height styling to modal */
const applyHeightStyling = (
    height: 'full' | number | undefined,
    modalClasses: string
): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    const styles: {height?: string; maxHeight?: string} = {};
    let classes = modalClasses;
    
    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
    } else if (height === 'full') {
        classes = clsx(classes, 'h-full');
    }
    
    return {classes, styles};
};

const Modal = forwardRef<HTMLElement, ModalProps>(({
    size = 'md',
    align = 'center',
    width,
    height,
    testId,
    title,
    okLabel = 'OK',
    okLoading = false,
    cancelLabel = 'Cancel',
    footer,
    header,
    leftButtonProps,
    buttonsDisabled,
    okDisabled,
    padding = true,
    onOk,
    okColor = 'black',
    onCancel,
    topRightContent,
    hideXOnMobile = false,
    afterClose,
    children,
    backDrop = true,
    backDropClick = true,
    stickyFooter = false,
    stickyHeader = false,
    scrolling = true,
    dirty = false,
    animate = true,
    formSheet = false,
    enableCMDS = true,
    allowBackgroundInteraction = false
}, ref) => {
    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                const activeEl = document.activeElement;
                if (activeEl?.hasAttribute('data-kg-link-input')) {
                    return;
                }

                if (document.activeElement && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                
                setTimeout(() => {
                    if (onCancel) {
                        onCancel();
                    } else {
                        confirmIfDirty(dirty, () => {
                            modal.remove();
                            afterClose?.();
                        });
                    }
                });

                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    }, [onOk, enableCMDS]);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    /** Build button array for footer */
    const buildButtons = (): ButtonProps[] => {
        const btns: ButtonProps[] = [];

        if (!footer && cancelLabel) {
            btns.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel || (() => removeModal()),
                disabled: buttonsDisabled
            });
        }

        if (!footer && okLabel) {
            btns.push({
                key: 'ok-modal',
                label: okLabel,
                color: okColor,
                className: 'min-w-[80px]',
                onClick: onOk,
                disabled: buttonsDisabled || okDisabled,
                loading: okLoading
            });
        }

        return btns;
    };

    const buttons = buildButtons();
    const sizeConfig = getSizeConfig(size);
    
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';
    
    let modalClasses = buildModalClasses(size, align, animate, formSheet, animationFinished, scrolling, sizeConfig);
    let backdropClasses = buildBackdropClasses(allowBackgroundInteraction, formSheet, sizeConfig);
    let headerClasses = buildHeaderClasses(topRightContent, stickyHeader, sizeConfig, paddingClasses);
    let contentClasses = buildContentClasses(paddingClasses, size, height);

    const widthResult = applyWidthStyling(width, modalClasses);
    modalClasses = widthResult.classes;
    const modalStyles = widthResult.styles;

    const heightResult = applyHeightStyling(height, modalClasses);
    modalClasses = heightResult.classes;
    Object.assign(modalStyles, heightResult.styles);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    /** Render footer content based on footer prop */
    const renderFooterContent = (): React.ReactNode => {
        if (footer) {
            return footer;
        }
        
        if (footer === false) {
            contentClasses = clsx(contentClasses, 'pb-0');
            return null;
        }

        const footerClasses = clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );

        return (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    };

    const footerContent = renderFooterContent();

    const wrappedFooterContent = stickyFooter ?
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
        :
        <>
            {footerContent}
        </>;

    /** Render header based on topRightContent */
    const renderHeader = (): React.ReactNode => {
        if (header === false) {
            return '';
        }

        const closeButton = (
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
            </div>
        );

        const shouldShowCloseButton = !topRightContent || topRightContent === 'close';

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {shouldShowCloseButton ? closeButton : topRightContent}
            </header>
        );
    };

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                modalClasses,
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={modalStyles}>
                {renderHeader()}
                <div className={contentClasses}>
                    {children}
                </div>
                {wrappedFooterContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;