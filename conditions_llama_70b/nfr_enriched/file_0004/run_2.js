import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
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

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

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
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    setGlobalDirtyState(dirty);
  }, [dirty, setGlobalDirtyState]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    // Clean up the event listener when the modal is closed
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
    if (onOk) {
      const handleCMDS = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          onOk();
        }
      };
      if (enableCMDS) {
        window.addEventListener('keydown', handleCMDS);
        return () => {
          window.removeEventListener('keydown', handleCMDS);
        };
      }
    }
  }, [onOk, enableCMDS]);

  const getModalClasses = (size: ModalSize, align: 'center' | 'left' | 'right', animate: boolean, animationFinished: boolean, formSheet: boolean, scrolling: boolean) => {
    // The animation classes apply a transform to the modal, which breaks anything inside using position:fixed
    // We should remove the class as soon as the animation is finished
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

  const getBackdropClasses = (backDrop: boolean, allowBackgroundInteraction: boolean) => {
    return clsx(
      'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
      allowBackgroundInteraction && 'pointer-events-none'
    );
  };

  const getHeaderClasses = (stickyHeader: boolean, paddingClasses: string) => {
    return clsx(
      stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
      paddingClasses,
      'pb-0'
    );
  };

  const getContentClasses = (paddingClasses: string, size: ModalSize, height: 'full' | number) => {
    return clsx(
      paddingClasses,
      'py-0',
      ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );
  };

  const getFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
    return clsx(
      `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
      'flex w-full items-center justify-between'
    );
  };

  const getModalStyles = (width: 'full' | 'toSidebar' | number, height: 'full' | number) => {
    const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

    if (typeof width === 'number') {
      modalStyles.width = '100%';
      modalStyles.maxWidth = width + 'px';
    } else if (width === 'full') {
      modalStyles.width = '100%';
    } else if (width === 'toSidebar') {
      modalStyles.width = '100%';
      modalStyles.maxWidth = 'calc(100dvw - 280px)';
    }

    if (typeof height === 'number') {
      modalStyles.height = '100%';
      modalStyles.maxHeight = height + 'px';
    } else if (height === 'full') {
      modalStyles.height = '100%';
    }

    return modalStyles;
  };

  const getButtons = (okLabel: string, okColor: ButtonColor, okLoading: boolean, cancelLabel: string, buttonsDisabled: boolean, okDisabled: boolean, onOk: () => void, onCancel: () => void) => {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
      buttons.push({
        key: 'cancel-modal',
        label: cancelLabel,
        color: 'outline',
        onClick: (onCancel ? onCancel : () => {
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

    return buttons;
  };

  const getFooterContent = (footer: boolean | React.ReactNode, leftButtonProps: ButtonProps | undefined, buttons: ButtonProps[], stickyFooter: boolean) => {
    let footerContent;

    if (footer) {
      footerContent = footer;
    } else if (footer === false) {
      return <></>;
    } else {
      footerContent = (
        <div className={getFooterClasses('p-8', stickyFooter)}>
          <div>
            {leftButtonProps && <Button {...leftButtonProps} />}
          </div>
          <div className='flex gap-3'>
            <ButtonGroup buttons={buttons} />
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && backDropClick) {
      confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
      });
    }
  };

  const removeModal = () => {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  };

  const modalClasses = getModalClasses(size, align, animate, animationFinished, formSheet, scrolling);
  const backdropClasses = getBackdropClasses(backDrop, allowBackgroundInteraction);
  const paddingClasses = padding ? 'p-8' : 'p-0';
  const headerClasses = getHeaderClasses(stickyHeader, paddingClasses);
  const contentClasses = getContentClasses(paddingClasses, size, height);
  const footerClasses = getFooterClasses(paddingClasses, stickyFooter);
  const modalStyles = getModalStyles(width, height);
  const buttons = getButtons(okLabel, okColor, okLoading, cancelLabel, buttonsDisabled, okDisabled, onOk, onCancel);
  const footerContent = getFooterContent(footer, leftButtonProps, buttons, stickyFooter);

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