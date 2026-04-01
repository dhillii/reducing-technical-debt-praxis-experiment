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

/** Configuration for each modal size variant */
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    padding: string;
    headerInset: string;
    fullHeight?: boolean;
}

/** Size configuration lookup table */
const SIZE_CONFIG: Record<ModalSize, SizeConfig> = {
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
        modalMaxWidth: '',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        fullHeight: true
    },
    bleed: {
        modalMaxWidth: '',
        backdropPadding: '',
        padding: 'p-10',
        headerInset: '-inset-x-10',
        fullHeight: true
    }
};

/**
 * Applies size-specific styling to modal classes
 */
const applySizeConfig = (size: ModalSize, modalClasses: string, backdropClasses: string): {modal: string; backdrop: string} => {
    const config = SIZE_CONFIG[size];
    
    let updatedModal = modalClasses;
    let updatedBackdrop = backdropClasses;

    if (config.modalMaxWidth) {
        updatedModal = clsx(updatedModal, config.modalMaxWidth);
    }

    if (config.backdropPadding) {
        updatedBackdrop = clsx(updatedBackdrop, config.backdropPadding);
    }

    if (config.fullHeight) {
        updatedModal = clsx(updatedModal, 'h-full');
    }

    return {modal: updatedModal, backdrop: updatedBackdrop};
};

/**
 * Determines if element is a Koenig link input
 */
const isKoenigLinkInput = (element: Element | null): boolean => {
    return element?.hasAttribute('data-kg-link-input') ?? false;
};

/**
 * Safely blurs active element (Safari fix)
 */
const safeBlurActiveElement = (): void => {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
};

/**
 * Builds button array based on footer and label props
 */
const buildButtons = (
    footer: boolean | React.ReactNode,
    cancelLabel: string | undefined,
    okLabel: string | undefined,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onCancel: (() => void) | undefined,
    removeModal: () => void
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
            onClick: onCancel ? onCancel : removeModal,
            disabled: buttonsDisabled
        });
    }

    if (okLabel) {
        buttons.push({
            key: 'ok-modal',
            label: okLabel,
            color: okColor,
            className: 'min-w-[80px]',
            onClick: onCancel,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

/**
 * Applies alignment-specific classes to modal
 */
const applyAlignmentClasses = (modalClasses: string, align: 'center' | 'left' | 'right'): string => {
    const alignmentMap: Record<string, string> = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    return clsx(modalClasses, alignmentMap[align]);
};

/**
 * Applies animation classes based on conditions
 */
const applyAnimationClasses = (
    modalClasses: string,
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    align: 'center' | 'left' | 'right'
): string => {
    if (!animate || formSheet || animationFinished) {
        return modalClasses;
    }

    const animationMap: Record<string, string> = {
        center: 'animate-modal-in',
        right: 'animate-modal-in-from-right',
        left: ''
    };

    return clsx(modalClasses, animationMap[align]);
};

/**
 * Applies form sheet animation if applicable
 */
const applyFormSheetAnimation = (modalClasses: string, formSheet: boolean, animationFinished: boolean): string => {
    if (formSheet && !animationFinished) {
        return clsx(modalClasses, 'animate-modal-in-reverse');
    }
    return modalClasses;
};

/**
 * Applies width styling to modal
 */
const applyWidthStyling = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string,
    modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;}
): string => {
    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
        return modalClasses;
    }

    if (width === 'full') {
        return clsx(modalClasses, 'w-full');
    }

    if (width === 'toSidebar') {
        return clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
    }

    return modalClasses;
};

/**
 * Applies height styling to modal
 */
const applyHeightStyling = (
    height: 'full' | number | undefined,
    modalClasses: string,
    modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;}
): string => {
    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
        return modalClasses;
    }

    if (height === 'full') {
        return clsx(modalClasses, 'h-full');
    }

    return modalClasses;
};

/**
 * Determines if content should grow to fill available space
 */
const shouldContentGrow = (size: ModalSize, height: 'full' | number | undefined): boolean => {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/**
 * Renders modal header based on topRightContent
 */
const renderModalHeader = (
    headerClasses: string,
    title: string | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    hideXOnMobile: boolean,
    removeModal: () => void
): React.ReactNode => {
    const hasCustomContent = topRightContent && topRightContent !== 'close';

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {!hasCustomContent && (
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                </div>
            )}
            {hasCustomContent && topRightContent}
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

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (isKoenigLinkInput(document.activeElement)) {
                return;
            }

            safeBlurActiveElement();

            setTimeout(() => {
                if (onCancel) {
                    onCancel();
                } else {
                    removeModal();
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
                e.preventDefault();
                onOk();
            }
        };

        window.addEventListener('keydown', handleCMDS);
        return () => {
            window.removeEventListener('keydown', handleCMDS);
        };
    }, [onOk, enableCMDS]);

    const buttons = buildButtons(footer, cancelLabel, okLabel, okColor, buttonsDisabled, okDisabled, okLoading, onCancel, removeModal);

    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
    );

    modalClasses = applyAlignmentClasses(modalClasses, align);
    modalClasses = applyAnimationClasses(modalClasses, animate, formSheet, animationFinished, align);
    modalClasses = applyFormSheetAnimation(modalClasses, formSheet, animationFinished);

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
    );

    const sizeConfig = applySizeConfig(size, modalClasses, backdropClasses);
    modalClasses = sizeConfig.modal;
    backdropClasses = sizeConfig.backdrop;

    let paddingClasses = SIZE_CONFIG[size].padding;
    if (!padding) {
        paddingClasses = 'p-0';
    }

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    headerClasses = clsx(
        headerClasses,
        paddingClasses,
        'pb-0',
        SIZE_CONFIG[size].headerInset
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    modalClasses = applyWidthStyling(width, modalClasses, modalStyles);
    modalClasses = applyHeightStyling(height, modalClasses, modalStyles);

    backdropClasses = clsx(
        backdropClasses,
        'max-[800px]:!pb-20'
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldContentGrow(size, height) && 'grow'
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    let footerContent: React.ReactNode;
    if (footer) {
        footerContent = footer;
    } else if (footer === false) {
        contentClasses = clsx(contentClasses, 'pb-0');
        footerContent = null;
    } else {
        footerContent = (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    }

    footerContent = renderFooterContent(footerContent, stickyFooter);

    const headerContent = header === false ? null : renderModalHeader(headerClasses, title, topRightContent, hideXOnMobile, removeModal);

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
                {headerContent}
                <div className={contentClasses}>
                    {children}
                </div>
                {footerContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;
```