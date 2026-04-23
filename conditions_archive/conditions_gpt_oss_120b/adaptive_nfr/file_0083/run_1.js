import router, { useRouter } from 'next/router'
import {
  type FormEvent,
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@keystar/ui/button'
import { AlertDialog, DialogContainer, DialogTrigger } from '@keystar/ui/dialog'
import { Icon } from '@keystar/ui/icon'
import { fileWarningIcon } from '@keystar/ui/icon/icons/fileWarningIcon'
import { Box, VStack } from '@keystar/ui/layout'
import { ProgressCircle } from '@keystar/ui/progress'
import { SlotProvider } from '@keystar/ui/slots'
import { toastQueue } from '@keystar/ui/toast'
import { Heading, Text } from '@keystar/ui/typography'

import { CombinedGraphQLErrors, gql, useMutation } from '../../../../admin-ui/apollo'
import { CreateButtonLink } from '../../../../admin-ui/components/CreateButtonLink'
import { ErrorDetailsDialog } from '../../../../admin-ui/components/Errors'
import { GraphQLErrorNotice } from '../../../../admin-ui/components/GraphQLErrorNotice'
import { PageContainer } from '../../../../admin-ui/components/PageContainer'
import { useList, useListItem } from '../../../../admin-ui/context'
import {
  deserializeItemToValue,
  Fields,
  serializeValueToOperationItem,
  useHasChanges,
  useInvalidFields,
} from '../../../../admin-ui/utils'
import type {
  ActionMeta,
  BaseListTypeInfo,
  ConditionalFilter,
  ConditionalFilterCase,
  ListMeta,
} from '../../../../types'
import { BaseToolbar, ColumnLayout, ItemPageHeader, StickySidebar } from './common'

type ItemPageProps = {
  listKey: string
}

/**
 * Stable callback that always references the latest version of `callback`.
 */
function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

/**
 * Handles navigation after an action is performed.
 */
function handleNavigation(
  action: ActionMeta,
  resultId: string | null,
  itemId: string | undefined,
  list: ListMeta,
  routerInstance: ReturnType<typeof useRouter>
) {
  const { navigation } = action.itemView

  const shouldRefetch =
    (navigation === 'follow' && resultId === itemId) || navigation === 'refetch'
  if (shouldRefetch) {
    routerInstance.reload()
    return
  }

  if (navigation === 'follow' && resultId) {
    routerInstance.push(`/${list.path}/${resultId}`)
    return
  }

  routerInstance.push(list.isSingleton ? '/' : `/${list.path}`)
}

/**
 * Determines whether the item is considered "not found".
 */
function isItemNotFound(item: unknown, list: ListMeta, itemId: string | undefined): boolean {
  return item == null && (list.isSingleton ? true : !!itemId)
}

/**
 * Renders the appropriate "not found" UI based on list configuration.
 */
function NotFoundMessage({
  list,
  itemId,
}: {
  list: ListMeta
  itemId: string | undefined
}) {
  if (list.isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
          {!list.hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID <strong>“{itemId}”</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have access to it.
      </Text>
    </ItemNotFound>
  )
}

/**
 * Computes meta information for the item page (actions, field modes, etc.).
 */
function computeItemPageMeta(
  list: ListMeta,
  data: ReturnType<typeof useListItem>['data']
) {
  const actionModes: Record<string, ActionMeta['itemView']['actionMode']> = {}
  const fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>> =
    {}
  const fieldPositions: Record<string, 'form' | 'sidebar'> = {}
  const isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>> = {}

  // Populate from list definition
  Object.entries(list.actions).forEach(([k, v]) => {
    actionModes[k] = v.itemView.actionMode
  })
  Object.entries(list.fields).forEach(([k, v]) => {
    fieldModes[k] = v.itemView.fieldMode
    fieldPositions[k] = v.itemView.fieldPosition
    isRequireds[k] = v.itemView.isRequired
  })

  // Override with admin meta if present
  const adminFields = data?.keystone?.adminMeta?.list?.fields ?? []
  adminFields.forEach(field => {
    if (
      !field?.itemView ||
      !field.key ||
      !field.itemView.fieldMode ||
      !field.itemView.fieldPosition ||
      field.itemView.isRequired === undefined
    )
      return
    fieldModes[field.key] = field.itemView.fieldMode
    fieldPositions[field.key] = field.itemView.fieldPosition
    isRequireds[field.key] = field.itemView.isRequired
  })

  const adminActions = data?.keystone?.adminMeta?.list?.actions ?? []
  adminActions.forEach(action => {
    if (!action?.itemView?.actionMode || !action.key) return
    actionModes[action.key] = action.itemView.actionMode
  })

  const actionsInContext = list.actions
    .map(action => ({
      ...action,
      itemView: {
        ...action.itemView,
        actionMode: actionModes[action.key],
      },
    }))
    .filter(action => action.itemView.actionMode !== 'hidden')

  return { actionsInContext, fieldModes, fieldPositions, isRequireds }
}

/**
 * Delete button component.
 */
function DeleteButton({
  list,
  itemId,
  itemLabel,
}: {
  list: ListMeta
  itemId: string
  itemLabel: string
}) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const routerInstance = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={async () => {
            try {
              await deleteItem()
            } catch (err: any) {
              toastQueue.critical('Unable to delete item', {
                actionLabel: 'Details',
                onAction: () => setErrorDialogValue(err),
                shouldCloseOnAction: true,
              })
              return
            }

            toastQueue.neutral(`${list.singular} deleted.`, {
              timeout: 5000,
            })
            routerInstance.push(list.isSingleton ? '/' : `/${list.path}`)
          }}
        >
          <Text>
            Are you sure you want to delete{' '}
            <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>? This action cannot be
            undone.
          </Text>
        </AlertDialog>
      </DialogTrigger>

      <DialogContainer onDismiss={() => setErrorDialogValue(null)} isDismissable>
        {errorDialogValue && (
          <ErrorDetailsDialog title="Unable to delete item" error={errorDialogValue} />
        )}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Simple "item not found" UI.
 */
function ItemNotFound(props: PropsWithChildren) {
  return (
    <VStack
      alignItems="center"
      backgroundColor="surface"
      borderRadius="medium"
      gap="large"
      justifyContent="center"
      minHeight="scale.3000"
      padding="xlarge"
    >
      <Icon src={fileWarningIcon} color="neutralEmphasis" size="large" />
      <Heading align="center">Not found</Heading>
      <SlotProvider slots={{ text: { align: 'center', maxWidth: 'scale.5000' } }}>
        {props.children}
      </SlotProvider>
    </VStack>
  )
}

/**
 * Reset button component.
 */
function ResetButton(props: { onReset: () => void; hasChanges?: boolean }) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!props.hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={props.onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

/**
 * Form for editing an item.
 */
function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [value, setValue] = useState(() => initialValue)
  const resetValueState = () => setValue(() => initialValue)
  useEffect(() => resetValueState(), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const hasInvalid = invalidFields.size !== 0
    setForceValidation(hasInvalid)
    if (hasInvalid) return

    const { error: _error } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const gqlError = CombinedGraphQLErrors.is(_error)
      ? _error.errors.find(x => x.path === undefined || x.path?.length === 1)
      : _error
    if (gqlError) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(gqlError.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })
    onSaveSuccess()
  })

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        {/* Workaround for react-aria "bug" where pressing enter in a form field moves focus to the submit button. */}
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            isRequireds={isRequireds}
          />
        </VStack>

        <StickySidebar>
          <Fields
            view="itemView"
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={useCallback(value => setValue(value), [setValue])}
            value={value}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
          />
        </StickySidebar>

        <BaseToolbar>
          <Button
            isDisabled={!hasChangedFields}
            isPending={loading}
            prominence="high"
            type="submit"
          >
            Save
          </Button>
          <ResetButton hasChanges={hasChangedFields} onReset={resetValueState} />
          <Box flex />
          {!list.hideDelete ? (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          ) : null}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Exported factory for the item page component.
 */
export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

/**
 * Main item page component.
 */
function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const routerInstance = useRouter()
  const id_ = routerInstance.query.id
  const [itemId] = Array.isArray(id_) ? id_ : [id_]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)
  const item = data?.item
  const itemLabel_ = item?.[list.labelField] ?? item?.id
  const itemLabel = typeof itemLabel_ === 'string' ? itemLabel_ : (itemId ?? '')

  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle =
    list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel

  const initialValue = useMemo(() => {
    if (!item) return null
    return deserializeItemToValue(list.fields, item)
  }, [list.fields, data?.item])

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(
    () => computeItemPageMeta(list, data),
    [list, data]
  )

  const onAction = (action: ActionMeta, resultId: string | null) => {
    handleNavigation(action, resultId, itemId, list, routerInstance)
  }

  return (
    <PageContainer
      title={pageTitle}
      header={
        <ItemPageHeader
          list={list}
          actions={actionsInContext}
          label={typeof pageLabel !== 'string' ? 'Loading...' : pageLabel}
          title={pageTitle}
          item={item ?? null}
          onAction={onAction}
        />
      }
    >
      {pageLoading ? (
        <VStack height="100%" alignItems="center" justifyContent="center">
          <ProgressCircle aria-label="loading item data" size="large" isIndeterminate />
        </VStack>
      ) : (
        <ColumnLayout>
          <Box marginY="xlarge">
            <GraphQLErrorNotice errors={[error]} />
            {isItemNotFound(item, list, itemId) && <NotFoundMessage list={list} itemId={itemId} />}
          </Box>
          {initialValue && (
            <ItemForm
              fieldModes={fieldModes}
              fieldPositions={fieldPositions}
              isRequireds={isRequireds}
              listKey={listKey}
              itemLabel={itemLabel}
              initialValue={initialValue}
              onSaveSuccess={refetch}
            />
          )}
        </ColumnLayout>
      )}
    </PageContainer>
  )
}