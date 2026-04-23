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
 * Determines if the modal should grow to fill available space
 */
const shouldGrowContent = (size: ModalSize, height?: 'full' | number): boolean => {
    return size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number';
};

/**
 * Determines if animation should be applied to the modal
 */
const shouldAnimateModal = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: string): boolean => {
    return animate && !formSheet && !animationFinished && (align === 'center' || align === 'right');
};

/**
 * Gets the animation class based on alignment
 */
const getAnimationClass = (animate: boolean, formSheet: boolean, animationFinished: boolean, align: string): string => {
    if (!shouldAnimateModal(animate, formSheet, animationFinished, align)) {
        return '';
    }
    return align === 'right' ? 'animate-modal-in-from-right' : 'animate-modal-in';
};

/**
 * Applies alignment-based classes to modal
 */
const getAlignmentClasses = (align: string): string => {
    const alignmentMap: Record<string, string> = {
        center: 'mx-auto',
        left: 'mr-auto',
        right: 'ml-auto'
    };
    return alignmentMap[align] || '';
};

/**
 * Applies width-based classes to modal
 */
const applyWidthStyles = (width?: 'full' | 'toSidebar' | number): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    if (typeof width === 'number') {
        return {
            classes: '',
            styles: {width: '100%', maxWidth: width + 'px'}
        };
    }
    if (width === 'full') {
        return {classes: 'w-full', styles: {}};
    }
    if (width === 'toSidebar') {
        return {
            classes: 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]',
            styles: {}
        };
    }
    return {classes: '', styles: {}};
};

/**
 * Applies height-based classes and styles to modal
 */
const applyHeightStyles = (height?: 'full' | number): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    if (typeof height === 'number') {
        return {
            classes: '',
            styles: {height: '100%', maxHeight: height + 'px'}
        };
    }
    if (height === 'full') {
        return {classes: 'h-full', styles: {}};
    }
    return {classes: '', styles: {}};
};

/**
 * Builds button array for modal footer
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
            onClick: onCancel ? undefined : removeModal,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

/**
 * Renders the modal header with title and optional close button
 */
const renderHeader = (
    header: boolean | undefined,
    topRightContent: 'close' | React.ReactNode | undefined,
    title: string | undefined,
    hideXOnMobile: boolean,
    headerClasses: string,
    removeModal: () => void
): React.ReactNode => {
    if (header === false) {
        return '';
    }

    const isCloseButton = !topRightContent || topRightContent === 'close';

    return (
        <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {isCloseButton ? (
                <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                    <Button
                        className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                        icon='close'
                        iconColorClass='text-black dark:text-white'
                        size='sm'
                        testId='close-modal'
                        unstyled
                        onClick={removeModal}
                    />
                </div>
            ) : (
                topRightContent
            )}
        </header>
    );
};

/**
 * Renders the modal footer with buttons or custom content
 */
const renderFooter = (
    footer: boolean | React.ReactNode,
    footerClasses: string,
    stickyFooter: boolean,
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[]
): React.ReactNode => {
    let footerContent: React.ReactNode;

    if (footer && typeof footer !== 'boolean') {
        footerContent = footer;
    } else if (footer === false) {
        return null;
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

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>{footerContent}</>
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

    // Get size configuration
    const sizeConfig = SIZE_CONFIG[size] || SIZE_CONFIG.default;

    // Build buttons
    const buttons = buildButtons(
        footer,
        cancelLabel,
        okLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onCancel,
        removeModal
    );

    // Build modal classes
    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        getAlignmentClasses(align),
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        getAnimationClass(animate, formSheet, animationFinished, align),
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth
    );

    // Build backdrop classes
    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.includeBackdrop && sizeConfig.backdropPadding,
        'max-[800px]:!pb-20'
    );

    // Build header classes
    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        sizeConfig.headerInset
    );

    if (stickyHeader) {
        headerClasses = clsx(
            headerClasses,
            'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );
    }

    // Apply padding
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';

    headerClasses = clsx(
        headerClasses,
        paddingClasses,
        'pb-0'
    );

    let contentClasses = clsx(
        paddingClasses,
        'py-0',
        shouldGrowContent(size, height) && 'grow'
    );

    // Apply width styles
    const widthResult = applyWidthStyles(width);
    modalClasses = clsx(modalClasses, widthResult.classes);

    // Apply height styles
    const heightResult = applyHeightStyles(height);
    modalClasses = clsx(modalClasses, heightResult.classes);

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {
        ...widthResult.styles,
        ...heightResult.styles
    };

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const footerContent = renderFooter(footer, footerClasses, stickyFooter, leftButtonProps, buttons);

    if (footer === false) {
        contentClasses = clsx(contentClasses, 'pb-0');
    }

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(
                    modalClasses,
                    allowBackgroundInteraction && 'pointer-events-auto'
                )}
                data-testid={testId}
                style={modalStyles}
            >
                {renderHeader(header, topRightContent, title, hideXOnMobile, headerClasses, removeModal)}
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