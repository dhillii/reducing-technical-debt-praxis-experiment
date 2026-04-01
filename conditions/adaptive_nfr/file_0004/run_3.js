```typescript
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

/** Configuration for modal sizes with their styling properties */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
    includeBackdrop: boolean;
}

/** Lookup table for size-based styling configurations */
const SIZE_CONFIG: Record<ModalSize | 'default', SizeConfig> = {
    sm: {
        modalMaxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8',
        includeBackdrop: true
    },
    md: {
        modalMaxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8',
        includeBackdrop: true
    },
    lg: {
        modalMaxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerInset: '-inset-x-8',
        includeBackdrop: true
    },
    xl: {
        modalMaxWidth: 'max-w-[1240px]0',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10 -top-10',
        includeBackdrop: true
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        includeBackdrop: true
    },
    bleed: {
        modalMaxWidth: 'h-full',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        includeBackdrop: false
    },
    default: {
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8',
        includeBackdrop: true
    }
};

/**
 * Determines if an element is a Koenig link input
 */
const isKoenigLinkInput = (element: Element | null): boolean => {
    return element?.hasAttribute('data-kg-link-input') ?? false;
};

/**
 * Blurs the active element if it's an HTMLElement
 */
const blurActiveElement = (): void => {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
};

/**
 * Gets the appropriate size configuration
 */
const getSizeConfig = (size: ModalSize | undefined): SizeConfig => {
    return SIZE_CONFIG[size || 'md'] || SIZE_CONFIG.default;
};

/**
 * Applies size-based styling to modal classes
 */
const applySizeStyles = (
    size: ModalSize | undefined,
    modalClasses: string,
    backdropClasses: string,
    headerClasses: string
): {modal: string; backdrop: string; header: string} => {
    const config = getSizeConfig(size);
    
    return {
        modal: clsx(modalClasses, config.modalMaxWidth),
        backdrop: clsx(backdropClasses, config.includeBackdrop && config.backdropPadding),
        header: clsx(headerClasses, config.headerInset)
    };
};

/**
 * Applies width styling to modal
 */
const applyWidthStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string,
    modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;}
): {classes: string; styles: typeof modalStyles} => {
    if (typeof width === 'number') {
        return {
            classes: modalClasses,
            styles: {...modalStyles, width: '100%', maxWidth: width + 'px'}
        };
    }
    
    if (width === 'full') {
        return {
            classes: clsx(modalClasses, 'w-full'),
            styles: modalStyles
        };
    }
    
    if (width === 'toSidebar') {
        return {
            classes: clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'),
            styles: modalStyles
        };
    }
    
    return {classes: modalClasses, styles: modalStyles};
};

/**
 * Applies height styling to modal
 */
const applyHeightStyles = (
    height: 'full' | number | undefined,
    modalClasses: string,
    modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;}
): {classes: string; styles: typeof modalStyles} => {
    if (typeof height === 'number') {
        return {
            classes: modalClasses,
            styles: {...modalStyles, height: '100%', maxHeight: height + 'px'}
        };
    }
    
    if (height === 'full') {
        return {
            classes: clsx(modalClasses, 'h-full'),
            styles: modalStyles
        };
    }
    
    return {classes: modalClasses, styles: modalStyles};
};

/**
 * Determines if content should grow to fill available space
 */
const shouldContentGrow = (
    size: ModalSize | undefined,
    height: 'full' | number | undefined
): boolean => {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/**
 * Builds animation classes based on conditions
 */
const getAnimationClasses = (
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    align: 'center' | 'left' | 'right'
): string => {
    if (!animate || formSheet || animationFinished) {
        return '';
    }
    
    if (align === 'right') {
        return 'animate-modal-in-from-right';
    }
    
    if (align === 'center') {
        return 'animate-modal-in';
    }
    
    return '';
};

/**
 * Builds form sheet animation classes
 */
const getFormSheetAnimationClasses = (
    formSheet: boolean,
    animationFinished: boolean
): string => {
    return formSheet && !animationFinished ? 'animate-modal-in-reverse' : '';
};

/**
 * Determines alignment classes
 */
const getAlignmentClasses = (align: 'center' | 'left' | 'right'): string => {
    switch (align) {
    case 'left':
        return 'mr-auto';
    case 'right':
        return 'ml-auto';
    case 'center':
    default:
        return 'mx-auto';
    }
};

/**
 * Builds header classes based on sticky and content conditions
 */
const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    paddingClasses: string,
    headerInsetClasses: string
): string => {
    const baseClasses = (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5';
    const stickyClasses = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';
    
    return clsx(baseClasses, stickyClasses, paddingClasses, headerInsetClasses, 'pb-0');
};

/**
 * Renders the modal header based on topRightContent
 */
const renderHeader = (
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    headerClasses: string,
    removeModal: () => void
): React.ReactNode => {
    if (topRightContent === 'close' || !topRightContent) {
        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                </div>
            </header>
        );
    }
    
    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent}
        </header>
    );
};

/**
 * Renders footer content with optional sticky wrapper
 */
const renderFooterContent = (
    footerContent: React.ReactNode,
    stickyFooter: boolean
): React.ReactNode => {
    if (!stickyFooter) {
        return footerContent;
    }
    
    return (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    );
};

/**
 * Builds button array based on footer and label conditions
 */
const buildButtonArray = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void,
    onOk: (() => void) | undefined
): ButtonProps[] => {
    if (footer) {
        return [];
    }
    
    const buttons: ButtonProps[] = [];
    
    if (cancelLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: cancelLabel,
            color: 'outline',
            onClick: onCancel || removeModal,
            disabled: buttonsDisabled
        });
    }
    
    if (okLabel) {
        buttons.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }
    
    return buttons;
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
            if (event.key !== 'Escape') {
                return;
            }
            
            const activeEl = document.activeElement;
            if (isKoenigLinkInput(activeEl)) {
                return;
            }

            blurActiveElement();
            
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
        if (!onOk || !enableCMDS) {
            return;
        }
        
        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e