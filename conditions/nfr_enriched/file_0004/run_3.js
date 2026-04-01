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
    stickyHeader?: boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

// Helper: Build button array for modal footer
const buildModalButtons = (
    footer: boolean | React.ReactNode,
    okLabel: string,
    cancelLabel: string,
    okColor: ButtonColor,
    buttonsDisabled: boolean | undefined,
    okDisabled: boolean | undefined,
    okLoading: boolean,
    onOk: (() => void) | undefined,
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
            onClick: onOk,
            disabled: buttonsDisabled || okDisabled,
            loading: okLoading
        });
    }

    return buttons;
};

// Helper: Get size-specific styling configuration
interface SizeConfig {
    modalMaxWidth: string;
    backdropPadding: string;
    contentPadding: string;
    headerInset: string;
}

const getSizeConfig = (size: ModalSize): SizeConfig => {
    switch (size) {
    case 'sm':
        return {
            modalMaxWidth: 'max-w-[480px]',
            backdropPadding: 'p-4 md:p-[8vmin]',
            contentPadding: 'p-8',
            headerInset: '-inset-x-8'
        };
    case 'md':
        return {
            modalMaxWidth: 'max-w-[720px]',
            backdropPadding: 'p-4 md:p-[8vmin]',
            contentPadding: 'p-8',
            headerInset: '-inset-x-8'
        };
    case 'lg':
        return {
            modalMaxWidth: 'max-w-[1020px]',
            backdropPadding: 'p-4 md:p-[4vmin]',
            contentPadding: 'p-7',
            headerInset: '-inset-x-8'
        };
    case 'xl':
        return {
            modalMaxWidth: 'max-w-[1240px]',
            backdropPadding: 'p-4 md:p-[3vmin]',
            contentPadding: 'p-10',
            headerInset: '-inset-x-10 -top-10'
        };
    case 'full':
        return {
            modalMaxWidth: '',
            backdropPadding: 'p-4 md:p-[3vmin]',
            contentPadding: 'p-10',
            headerInset: '-inset-x-10'
        };
    case 'bleed':
        return {
            modalMaxWidth: '',
            backdropPadding: '',
            contentPadding: 'p-10',
            headerInset: '-inset-x-10'
        };
    default:
        return {
            modalMaxWidth: '',
            backdropPadding: 'p-4 md:p-[8vmin]',
            contentPadding: 'p-8',
            headerInset: '-inset-x-8'
        };
    }
};

// Helper: Build modal classes based on props
const buildModalClasses = (
    size: ModalSize,
    align: 'center' | 'left' | 'right',
    animate: boolean,
    animationFinished: boolean,
    formSheet: boolean,
    scrolling: boolean,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
        (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth,
        size === 'full' && 'h-full',
        size === 'bleed' && 'h-full'
    );
};

// Helper: Build backdrop classes
const buildBackdropClasses = (
    size: ModalSize,
    formSheet: boolean,
    allowBackgroundInteraction: boolean,
    sizeConfig: SizeConfig
): string => {
    return clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeConfig.backdropPadding,
        'max-[800px]:!pb-20'
    );
};

// Helper: Build header classes
const buildHeaderClasses = (
    topRightContent: 'close' | React.ReactNode | undefined,
    stickyHeader: boolean,
    sizeConfig: SizeConfig,
    paddingClasses: string
): string => {
    const baseClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const stickyClasses = stickyHeader
        ? clsx(baseClasses, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black')
        : baseClasses;

    return clsx(
        stickyClasses,
        paddingClasses,
        'pb-0',
        sizeConfig.headerInset
    );
};

// Helper: Build content classes
const buildContentClasses = (
    size: ModalSize,
    height: 'full' | number | undefined,
    paddingClasses: string
): string => {
    return clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
};

// Helper: Apply width styles to modal
const applyWidthStyles = (
    width: 'full' | 'toSidebar' | number | undefined,
    modalClasses: string
): {classes: string; styles: {width?: string; maxWidth?: string}} => {
    const styles: {width?: string; maxWidth?: string} = {};

    if (typeof width === 'number') {
        styles.width = '100%';
        styles.maxWidth = width + 'px';
        return {classes: modalClasses, styles};
    }

    if (width === 'full') {
        return {
            classes: clsx(modalClasses, 'w-full'),
            styles
        };
    }

    if (width === 'toSidebar') {
        return {
            classes: clsx(modalClasses, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'),
            styles
        };
    }

    return {classes: modalClasses, styles};
};

// Helper: Apply height styles to modal
const applyHeightStyles = (
    height: 'full' | number | undefined,
    modalClasses: string
): {classes: string; styles: {height?: string; maxHeight?: string}} => {
    const styles: {height?: string; maxHeight?: string} = {};

    if (typeof height === 'number') {
        styles.height = '100%';
        styles.maxHeight = height + 'px';
        return {classes: modalClasses, styles};
    }

    if (height === 'full') {
        return {
            classes: clsx(modalClasses, 'h-full'),
            styles
        };
    }

    return {classes: modalClasses, styles};
};

// Helper: Build footer content
const buildFooterContent = (
    footer: boolean | React.ReactNode,
    buttons: ButtonProps[],
    leftButtonProps: ButtonProps | undefined,
    footerClasses: string,
    stickyFooter: boolean
): React.ReactNode => {
    if (footer === true) {
        return footer;
    }

    if (footer === false) {
        return null;
    }

    const defaultFooter = (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons}/>
            </div>
        </div>
    );

    return stickyFooter
        ? <StickyFooter height={84}>{defaultFooter}</StickyFooter>
        : defaultFooter;
};

// Helper: Handle escape key press
const setupEscapeKeyHandler = (
    onCancel: (() => void) | undefined,
    dirty: boolean,
    modal: any,
    afterClose: (() => void) | undefined,
    removeModal: () => void
): (() => void) => {
    const handleEscapeKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
            return;
        }

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
                removeModal();
            }
        });

        event.stopPropagation();
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
        document.removeEventListener('keydown', handleEscapeKey);
    };
};

// Helper: Setup CMD+S keyboard shortcut
const setupCmdSHandler = (onOk: (() => void) | undefined, enableCMDS: boolean): (() => void) | null => {
    if (!onOk || !enableCMDS) {
        return null;
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

    // Sync dirty state globally
    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    // Remove modal with dirty state confirmation
    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    // Setup escape key handler
    useEffect(() => {
        return setupEscapeKeyHandler(onCancel, dirty, modal, afterClose, removeModal);
    }, [modal, dirty, afterClose, onCancel]);

    // Setup animation finished state
    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    // Setup CMD+S handler
    useEffect(() => {
        return setupCmdSHandler(onOk, enableCMDS) || undefined;
    }, [onOk, enableCMDS]);

    // Get size configuration
    const sizeConfig = getSizeConfig(size);

    // Build button array
    const buttons = buildModalButtons(
        footer,
        okLabel,
        cancelLabel,
        okColor,
        buttonsDisabled,
        okDisabled,
        okLoading,
        onOk,
        onCancel,
        removeModal
    );

    // Determine padding classes
    const paddingClasses = padding ? sizeConfig.contentPadding : 'p-0';

    // Build modal classes
    let modalClasses = buildModalClasses(
        size,
        align,
        animate,
        animationFinished,
        formSheet,
        scrolling,
        sizeConfig
    );

    // Apply width styles
    const {classes: widthAppliedClasses, styles: widthStyles} = applyWidthStyles(width, modalClasses);
    modalClasses = widthAppliedClasses;

    // Apply height styles
    const {classes: heightAppliedClasses, styles: heightStyles} = applyHeightStyles(height, modalClasses);
    modalClasses = heightAppliedClasses;

    // Merge modal styles
    const modalStyles = {...widthStyles, ...heightStyles};

    // Build backdrop classes
    const backdropClasses = buildBackdropClasses(size, formSheet, allowBackgroundInteraction, sizeConfig);

    // Build header classes
    const headerClasses = buildHeaderClasses(topRightContent, stickyHeader, sizeConfig, paddingClasses);

    // Build content classes
    const contentClasses = buildContentClasses(size, height, paddingClasses);

    // Build footer classes
    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    // Build footer content
    const footerContent = buildFooterContent(footer, buttons, leftButtonProps, footerClasses, stickyFooter);

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Render header
    const renderHeader = () => {
        if (header === false) {
            return null;
        }

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
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
                {renderHeader()}
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