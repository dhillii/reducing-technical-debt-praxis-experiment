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
                handleEscapePressed(event);
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

    const handleEscapePressed = (event: KeyboardEvent) => {
        // Don't close modal if user is in Koenig's link input (which handles ESC itself)
        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
            return;
        }

        // Fix for Safari - if an element in the modal is focused, closing it will jump to
        // the bottom of the page because Safari tries to focus the "next" element in the DOM
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        
        // Close the modal on the next tick so that the blur registers
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

        // Prevent the event from bubbling up to the window level
        event.stopPropagation();
    };

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getButtons = (): ButtonProps[] => {
        if (footer) {
            return [];
        }

        const buttons: ButtonProps[] = [];
        
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : () => {
                    removeModal();
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
        
        return buttons;
    };

    const getModalClasses = (animationFinished: boolean) => {
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
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
        );
    };

    const getBackdropClasses = () => {
        return clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );
    };

    const getHeaderClasses = (paddingClasses: string, stickyHeader: boolean) => {
        let baseClasses = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            baseClasses = clsx(
                baseClasses,
                'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
            );
        }

        return clsx(
            baseClasses,
            paddingClasses,
            'pb-0'
        );
    };

    const getSizeConfig = (size: ModalSize) => {
        switch (size) {
        case 'sm':
            return {
                modal: 'max-w-[480px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8'
            };

        case 'md':
            return {
                modal: 'max-w-[720px]',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8'
            };

        case 'lg':
            return {
                modal: 'max-w-[1020px]',
                backdrop: 'p-4 md:p-[4vmin]',
                padding: 'p-7',
                header: '-inset-x-8'
            };

        case 'xl':
            return {
                modal: 'max-w-[1240px]0',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10 -top-10'
            };

        case 'full':
            return {
                modal: 'h-full',
                backdrop: 'p-4 md:p-[3vmin]',
                padding: 'p-10',
                header: '-inset-x-10'
            };

        case 'bleed':
            return {
                modal: 'h-full',
                backdrop: '',
                padding: 'p-10',
                header: '-inset-x-10'
            };

        default:
            return {
                modal: '',
                backdrop: 'p-4 md:p-[8vmin]',
                padding: 'p-8',
                header: '-inset-x-8'
            };
        }
    };

    const getContentClasses = (paddingClasses: string, size: ModalSize, height: 'full' | number | undefined) => {
        const baseClasses = clsx(
            paddingClasses,
            'py-0'
        );

        return clsx(
            baseClasses,
            ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
        );
    };

    const getFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
        return clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const getWidthStyles = (width: 'full' | 'toSidebar' | number | undefined) => {
        const styles: {width?: string; maxWidth?: string;} = {};
        
        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = width + 'px';
        }
        
        return styles;
    };

    const getHeightStyles = (height: 'full' | number | undefined) => {
        const styles: {height?: string; maxHeight?: string;} = {};
        
        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = height + 'px';
        }
        
        return styles;
    };

    const getWidthClasses = (width: 'full' | 'toSidebar' | number | undefined, modalClasses: string) => {
        if (width === 'full') {
            return clsx(modalClasses, 'w-full');
        } else if (width === 'toSidebar') {
            return clsx(
                modalClasses,
                'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
            );
        }
        return modalClasses;
    };

    const getHeightClasses = (height: 'full' | number | undefined, modalClasses: string) => {
        if (height === 'full') {
            return clsx(modalClasses, 'h-full');
        }
        return modalClasses;
    };

    const getFooterContent = (buttons: ButtonProps[], footer: boolean | React.ReactNode, 
        footerClasses: string, leftButtonProps: ButtonProps | undefined, stickyFooter: boolean) => {
        if (footer) {
            return footer;
        } else if (footer === false) {
            return null;
        } else {
            const content = (
                <div className={footerClasses}>
                    <div>
                        {leftButtonProps && <Button {...leftButtonProps} />}
                    </div>
                    <div className='flex gap-3'>
                        <ButtonGroup buttons={buttons}/>
                    </div>
                </div>
            );

            return stickyFooter ?
                <StickyFooter height={84}>
                    {content}
                </StickyFooter>
                :
                content;
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    // Configuration calculations
    const buttons = getButtons();
    const sizeConfig = getSizeConfig(size);
    
    let modalClasses = getModalClasses(animationFinished);
    let backdropClasses = getBackdropClasses();
    let paddingClasses = padding ? sizeConfig.padding : 'p-0';
    
    modalClasses = clsx(modalClasses, sizeConfig.modal);
    backdropClasses = clsx(backdropClasses, sizeConfig.backdrop);
    
    // Apply width/height configurations
    const widthStyles = getWidthStyles(width);
    const heightStyles = getHeightStyles(height);
    const modalStyles = {...widthStyles, ...heightStyles};
    
    modalClasses = getWidthClasses(width, modalClasses);
    modalClasses = getHeightClasses(height, modalClasses);
    
    // Header and content classes
    const headerClasses = getHeaderClasses(paddingClasses, stickyHeader);
    const contentClasses = getContentClasses(paddingClasses, size, height);
    const footerClasses = getFooterClasses(paddingClasses, stickyFooter);
    
    // Final adjustments
    backdropClasses = clsx(backdropClasses, 'max-[800px]:!pb-20');
    
    const footerContent = getFooterContent(buttons, footer, footerClasses, leftButtonProps, stickyFooter);

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