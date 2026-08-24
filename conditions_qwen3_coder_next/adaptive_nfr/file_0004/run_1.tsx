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

/**
 * Configuration object for modal sizing and styling classes.
 */
type ModalSizeConfig = {
    modalMaxWidth?: string;
    backdropPadding?: string;
    padding?: string;
    headerInset?: string;
    headerOffset?: string;
};

/**
 * Maps modal size strings to their corresponding styling configurations.
 */
const SIZE_CONFIGS: Record<string, ModalSizeConfig> = {
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
        headerInset: '-inset-x-10',
        headerOffset: '-top-10'
    },
    full: {
        modalMaxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    },
    bleed: {
        modalMaxWidth: 'h-full',
        padding: 'p-10',
        headerInset: '-inset-x-10'
    }
};

/**
 * Returns appropriate modal size config, or default config for unknown sizes.
 */
function getSizeConfig(size: string | number): ModalSizeConfig {
    return SIZE_CONFIGS[size as string] ?? {
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerInset: '-inset-x-8'
    };
}

/**
 * Returns true if modal animation is active and should apply transition classes.
 */
function isAnimating(animate: boolean, formSheet: boolean, animationFinished: boolean): boolean {
    return animate && !formSheet && !animationFinished;
}

/**
 * Returns true if the modal should show default close button on header.
 */
function shouldShowCloseButton(topRightContent: string | React.ReactNode | undefined): boolean {
    return topRightContent === undefined || topRightContent === 'close';
}

/**
 * Returns true if stickyFooter should be rendered encapsulated in StickyFooter component.
 */
function needsStickyFooterWrapper(stickyFooter: boolean): boolean {
    return stickyFooter;
}

/**
 * Builds backdrop classes considering backdrop, formSheet, and background interaction settings.
 */
function buildBackdropClasses(allowBackgroundInteraction: boolean, formSheet: boolean, sizeConfig: ModalSizeConfig): string {
    let base = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    if (allowBackgroundInteraction) {
        base = clsx(base, 'pointer-events-none');
    }

    base = clsx(base, sizeConfig.backdropPadding, 'max-[800px]:!pb-20');
    if (!formSheet) {
        base = clsx(base, topLevelBackdropClasses);
    } else {
        base = clsx(base, 'bg-[rgba(98,109,121,0.08)]');
    }
    return base;
}

/**
 * Builds header HTML element — handles title, title Visibility with topRightContent and close button.
 */
function buildHeader(
    title?: string,
    topRightContent?: 'close' | React.ReactNode,
    hideXOnMobile?: boolean,
    onClickClose?: () => void
): React.ReactNode {
    const showClose = shouldShowCloseButton(topRightContent);

    const commonHeaderClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
    );

    const content=(
        <header className={commonHeaderClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {showClose
                ? (
                    <div className={`${!showClose && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                        <Button
                            className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100'
                            icon='close'
                            iconColorClass='text-black dark:text-white'
                            size='sm'
                            testId='close-modal'
                            unstyled
                            onClick={onClickClose}
                        />
                    </div>
                )
                : topRightContent
            }
        </header>
    );

    return content;
}

/**
 * Builds footer content — either raw node, empty string, or built footer with buttons.
 */
function buildFooterContent(
    footer: boolean | React.ReactNode,
    leftButtonProps?: ButtonProps,
    buttons?: ButtonProps[],
    stickyFooter?: boolean
): React.ReactNode {
    if (footer === false) return 'pb-0';

    if (footer) return footer;

    const footerClasses = clsx(
        'p-8 pb-0',
        stickyFooter ? 'py-6' : '',
        'flex w-full items-center justify-between'
    );

    return (
        <div className={footerClasses}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons || []}/>
            </div>
        </div>
    );
}

/**
 * Builds sticky footer container when stickyFooter is true.
 */
function wrapWithStickyFooter(footerContent: React.ReactNode, stickyFooter: boolean): React.ReactNode {
    if (!stickyFooter) return footerContent;
    return (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    );
}

/**
 * Builds button list based on footer visibility, labels, and button state.
 */
function buildButtons(
    footer: boolean | React.ReactNode,
    okLabel?: string,
    okColor?: ButtonColor,
    onCancel?: () => void,
    onOk?: () => void,
    okLoading?: boolean,
    buttonsDisabled?: boolean,
    okDisabled?: boolean,
    removeModal: () => void = () => {}
): ButtonProps[] {
    if (footer) return [];

    const buttons: ButtonProps[] = [];

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

    if (onCancel || okLabel) {
        buttons.push({
            key: 'cancel-modal',
            label: onCancel ? 'Cancel' : 'OK',
            color: 'outline',
            onClick: onCancel || () => {
                removeModal();
            },
            disabled: buttonsDisabled
        });
    }

    return buttons;
}

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

    // Construct buttons list early for modular reuse
    const buttons = buildButtons(
        footer,
        okLabel,
        okColor,
        onCancel,
        onOk,
        okLoading,
        buttonsDisabled,
        okDisabled,
        removeModal
    );

    const sizeConfig = getSizeConfig(size);
    const backdropClasses = buildBackdropClasses(allowBackgroundInteraction, formSheet, sizeConfig);

    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto',
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl',
        (isAnimating(animate, formSheet, animationFinished) && align === 'center') && 'animate-modal-in',
        (isAnimating(animate, formSheet, animationFinished) && align === 'right') && 'animate-modal-in-from-right',
        (formSheet && !animationFinished) && 'animate-modal-in-reverse',
        scrolling ? 'overflow-y-auto' : 'overflow-y-hidden',
        sizeConfig.modalMaxWidth,
        size === 'full' || size === 'bleed' ? sizeConfig.modalMaxWidth : ''
    );

    let paddingClasses = sizeConfig.padding || 'p-8';
    if (!padding) paddingClasses = 'p-0';

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        paddingClasses,
        'pb-0',
        stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
        sizeConfig.headerInset && `${sizeConfig.headerInset}`,
        sizeConfig.headerOffset || ''
    );

    const contentClasses = clsx(
        paddingClasses,
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
        modalClasses = clsx(modalClasses, 'w-full');
    } else if (width === 'toSidebar') {
        modalClasses = clsx(
            modalClasses,
            'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
        );
    }

    if (typeof height === 'number') {
        modalStyles.height = '100%';
        modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            const activeEl = document.activeElement;
            if (activeEl?.hasAttribute('data-kg-link-input')) return;

            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

            setTimeout(() => {
                if (onCancel) {
                    onCancel();
                } else {
                    confirmIfDirty(dirty, () => {
                        modal.remove();
                        afterClose?.();
                    });
                }
            }, 0);

            event.stopPropagation();
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => document.removeEventListener('keydown', handleEscapeKey);
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
            return () => window.removeEventListener('keydown', handleCMDS);
        }
    }, [onOk, enableCMDS]);

    const footerContent = wrapWithStickyFooter(buildFooterContent(
        footer === undefined ? true : footer,
        leftButtonProps,
        buttons,
        stickyFooter
    ), needsStickyFooterWrapper(stickyFooter));

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section
                ref={ref}
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
                data-testid={testId}
                style={modalStyles}
            >
                {header === false ? '' : buildHeader(
                    title,
                    topRightContent,
                    hideXOnMobile,
                    removeModal
                )}
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