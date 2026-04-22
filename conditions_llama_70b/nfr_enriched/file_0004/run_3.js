```typescript
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
    const modalClasses = clsx(
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

    switch (size) {
      case 'sm':
        return clsx(modalClasses, 'max-w-[480px]');
      case 'md':
        return clsx(modalClasses, 'max-w-[720px]');
      case 'lg':
        return clsx(modalClasses, 'max-w-[1020px]');
      case 'xl':
        return clsx(modalClasses, 'max-w-[1240px]');
      case 'full':
        return clsx(modalClasses, 'h-full');
      case 'bleed':
        return clsx(modalClasses, 'h-full');
      default:
        return modalClasses;
    }
  };

  const getBackdropClasses = (size: ModalSize, allowBackgroundInteraction: boolean) => {
    const backdropClasses = clsx(
      'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
      allowBackgroundInteraction && 'pointer-events-none'
    );

    switch (size) {
      case 'sm':
      case 'md':
        return clsx(backdropClasses, 'p-4 md:p-[8vmin]');
      case 'lg':
        return clsx(backdropClasses, 'p-4 md:p-[4vmin]');
      case 'xl':
        return clsx(backdropClasses, 'p-4 md:p-[3vmin]');
      case 'full':
        return clsx(backdropClasses, 'p-4 md:p-[3vmin]');
      default:
        return clsx(backdropClasses, 'p-4 md:p-[8vmin]');
    }
  };

  const getPaddingClasses = (size: ModalSize, padding: boolean) => {
    switch (size) {
      case 'sm':
        return padding ? 'p-8' : 'p-0';
      case 'md':
        return padding ? 'p-8' : 'p-0';
      case 'lg':
        return padding ? 'p-7' : 'p-0';
      case 'xl':
        return padding ? 'p-10' : 'p-0';
      case 'full':
        return padding ? 'p-10' : 'p-0';
      case 'bleed':
        return padding ? 'p-10' : 'p-0';
      default:
        return padding ? 'p-8' : 'p-0';
    }
  };

  const getHeaderClasses = (size: ModalSize, stickyHeader: boolean, paddingClasses: string) => {
    const headerClasses = clsx(
      (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
      stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '',
      paddingClasses,
      'pb-0'
    );

    switch (size) {
      case 'sm':
        return clsx(headerClasses, '-inset-x-8');
      case 'md':
        return clsx(headerClasses, '-inset-x-8');
      case 'lg':
        return clsx(headerClasses, '-inset-x-8');
      case 'xl':
        return clsx(headerClasses, '-inset-x-10 -top-10');
      case 'full':
        return clsx(headerClasses, '-inset-x-10');
      case 'bleed':
        return clsx(headerClasses, '-inset-x-10');
      default:
        return clsx(headerClasses, '-inset-x-8');
    }
  };

  const getContentClasses = (size: ModalSize, paddingClasses: string, height: 'full' | number | undefined) => {
    const contentClasses = clsx(
      paddingClasses,
      'py-0',
      ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
    );

    return contentClasses;
  };

  const getFooterClasses = (paddingClasses: string, stickyFooter: boolean) => {
    return clsx(
      paddingClasses,
      stickyFooter ? 'py-6' : '',
      'flex w-full items-center justify-between'
    );
  };

  const getModalStyles = (width: 'full' | 'toSidebar' | number | undefined, height: 'full' | number | undefined) => {
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

  const getFooterContent = (footer: boolean | React.ReactNode, leftButtonProps: ButtonProps | undefined, buttonsDisabled: boolean, okLabel: string, okColor: ButtonColor, okLoading: boolean, cancelLabel: string, onOk: (() => void) | undefined, onCancel: (() => void) | undefined) => {
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

    if (footer) {
      return footer;
    } else if (footer === false) {
      return <></>;
    } else {
      return (
        <div className={getFooterClasses(getPaddingClasses(size, padding), stickyFooter)}>
          <div>
            {leftButtonProps && <Button {...leftButtonProps} />}
          </div>
          <div className='flex gap-3'>
            <ButtonGroup buttons={buttons} />
          </div>
        </div>
      );
    }
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

  return (
    <div className={getBackdropClasses(size, allowBackgroundInteraction)} id='modal-backdrop' onMouseDown={handleBackdropClick}>
      <div className={clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
      )}></div>
      <section ref={ref} className={getModalClasses(size, align, animate, animationFinished, formSheet, scrolling)} data-testid={testId} style={getModalStyles(width, height)}>
        {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
          (<header className={getHeaderClasses(size, stickyHeader, getPaddingClasses(size, padding))}>
            {title && <Heading level={3}>{title}</Heading>}
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
              <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
            </div>
          </header>)
          :
          (<header className={getHeaderClasses(size, stickyHeader, getPaddingClasses(size, padding))}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent}
          </header>))}
        <div className={getContentClasses(size, getPaddingClasses(size, padding), height)}>
          {children}
        </div>
        {stickyFooter ? (
          <StickyFooter height={84}>
            {getFooterContent(footer, leftButtonProps, buttonsDisabled, okLabel, okColor, okLoading, cancelLabel, onOk, onCancel)}
          </StickyFooter>
        ) : (
          getFooterContent(footer, leftButtonProps, buttonsDisabled, okLabel, okColor, okLoading, cancelLabel, onOk, onCancel)
        )}
      </section>
    </div>
  );
});

Modal.displayName = 'Modal';

export default Modal;
```