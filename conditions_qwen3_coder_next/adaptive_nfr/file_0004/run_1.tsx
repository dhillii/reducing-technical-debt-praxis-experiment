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

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

interface SizeClasses {
    maxWidth?: string;
    backdropPadding?: string;
    padding?: string;
    headerPadding?: string;
    stickyOffset?: string;
}

const sizeToClassesMap: Record<string, SizeClasses> = {
    sm: {
        maxWidth: 'max-w-[480px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerPadding: '-inset-x-8',
        stickyOffset: ''
    },
    md: {
        maxWidth: 'max-w-[720px]',
        backdropPadding: 'p-4 md:p-[8vmin]',
        padding: 'p-8',
        headerPadding: '-inset-x-8',
        stickyOffset: ''
    },
    lg: {
        maxWidth: 'max-w-[1020px]',
        backdropPadding: 'p-4 md:p-[4vmin]',
        padding: 'p-7',
        headerPadding: '-inset-x-8',
        stickyOffset: ''
    },
    xl: {
        maxWidth: 'max-w-[1240px]0',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerPadding: '-inset-x-10 -top-10',
        stickyOffset: ''
    },
    full: {
        maxWidth: 'h-full',
        backdropPadding: 'p-4 md:p-[3vmin]',
        padding: 'p-10',
        headerPadding: '-inset-x-10',
        stickyOffset: ''
    },
    bleed: {
        maxWidth: 'h-full',
        padding: 'p-10',
        headerPadding: '-inset-x-10',
        stickyOffset: '',
        backdropPadding: ''
    }
};

const defaultSizeClasses: SizeClasses = {
    backdropPadding: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    headerPadding: '-inset-x-8',
    stickyOffset: ''
};

function getSizeClasses(size: string): SizeClasses {
    return sizeToClassesMap[size] || defaultSizeClasses;
}

/**
 * Applies conditional classes for modal alignment
 * @param align - alignment option for modal
 */
function applyAlignClasses(
    modalClasses: string,
    align: 'center' | 'left' | 'right'
): string {
    return clsx(
        modalClasses,
        align === 'center' && 'mx-auto',
        align === 'left' && 'mr-auto',
        align === 'right' && 'ml-auto'
    );
}

/**
 * Applies animation classes conditionally
 */
function applyAnimationClasses(
    modalClasses: string,
    animate: boolean,
    formSheet: boolean,
    animationFinished: boolean,
    align: 'center' | 'left' | 'right'
): string {
    const animateClasses = [
        animate && !formSheet && !animationFinished && align === 'center' && 'animate-modal-in',
        animate && !formSheet && !animationFinished && align === 'right' && 'animate-modal-in-from-right',
        formSheet && !animationFinished && 'animate-modal-in-reverse'
    ];

    return clsx(
        modalClasses,
        ...animateClasses.filter(Boolean)
    );
}

/**
 * Applies sticky header classes when applicable
 */
function applyStickyHeaderClasses(
    headerClasses: string,
    stickyHeader: boolean
): string {
    return clsx(
        headerClasses,
        stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    );
}

/**
 * Constructs footer content JSX
 */
function buildFooterContent(
    footer: boolean | React.ReactNode,
    leftButtonProps: ButtonProps | undefined,
    buttons: ButtonProps[],
    stickyFooter: boolean
): React.ReactNode {
    if (footer) return footer;
    if (footer === false) return null;

    const footerElement = (
        <div className={clsx(
            'flex w-full items-center justify-between'
        )}>
            <div>
                {leftButtonProps && <Button {...leftButtonProps} />}
            </div>
            <div className='flex gap-3'>
                <ButtonGroup buttons={buttons} />
            </div>
        </div>
    );

    return stickyFooter ? (
        <StickyFooter height={84}>
            {footerElement}
        </StickyFooter>
    ) : footerElement;
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
        return () => document.removeEventListener('keydown', handleEscapeKey);
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimationFinished(true), 250);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!onOk || !enableCMDS) return;

        const handleCMDS = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onOk();
            }
        };

        window.addEventListener('keydown', handleCMDS);
        return () => window.removeEventListener('keydown', handleCMDS);
    }, [onOk, enableCMDS]);

    const buttons: ButtonProps[] = [];

    if (!footer) {
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: onCancel || (() => {
                    confirmIfDirty(dirty, () => {
                        modal.remove();
                        afterClose?.();
                    });
                }),
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
    }

    const sizeClasses = getSizeClasses(size);

    let modalClasses = clsx(
        'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
        applyAlignClasses('', align),
        size !== 'bleed' && 'rounded',
        formSheet ? 'shadow-md' : 'shadow-xl'
    );

    modalClasses = applyAnimationClasses(modalClasses, animate, formSheet, animationFinished, align);

    let backdropClasses = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none',
        sizeClasses.backdropPadding,
        'max-[800px]:!pb-20'
    );

    let paddingClasses = sizeClasses.padding || '';

    if (!padding) {
        paddingClasses = 'p-0';
    }

    if (stickyFooter) {
        paddingClasses += ' py-6';
    }

    let headerClasses = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
        applyStickyHeaderClasses('', stickyHeader),
        paddingClasses,
        'pb-0',
        sizeClasses.headerPadding,
        sizeClasses.stickyOffset
    );

    const contentClasses = clsx(
        paddingClasses,
        'py-0',
        ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    const modalStyles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

    if (typeof width === 'number') {
        modalStyles.width = '100%';
        modalStyles.maxWidth = `${width}px`;
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
        modalStyles.maxHeight = `${height}px`;
    } else if (height === 'full') {
        modalClasses = clsx(modalClasses, 'h-full');
    }

    modalClasses = clsx(
        modalClasses,
        size !== 'bleed' && sizeClasses.maxWidth
    );

    const footerClasses = clsx(
        `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
        'flex w-full items-center justify-between'
    );

    const footerContent = buildFooterContent(footer, leftButtonProps, buttons, stickyFooter);

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
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
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                        </div>
                    </header>)
                    :
                    (<header className={headerClasses}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>))}
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