```typescript
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

type FieldConfig = {
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
}

type ActionConfig = {
  actionsInContext: ActionMeta[]
}

// Custom hook for stable event callbacks
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

// Utility functions for error handling
const handleDeleteError = (error: Error, list: ListMeta) => {
  toastQueue.critical('Unable to delete item', {
    actionLabel: 'Details',
    onAction: () => {
      // Error dialog state managed by parent
    },
    shouldCloseOnAction: true,
  })
}

const handleDeleteSuccess = (list: ListMeta) => {
  toastQueue.neutral(`${list.singular} deleted.`, {
    timeout: 5000,
  })
}

const navigateAfterDelete = (list: ListMeta) => {
  router.push(list.isSingleton ? '/' : `/${list.path}`)
}

// Utility function to build delete mutation
const buildDeleteMutation = (list: ListMeta) =>
  gql`mutation ($id: ID!) {
    ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
      id
    }
  }`

// Utility function to build update mutation
const buildUpdateMutation = (list: ListMeta) =>
  gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
    item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
      id
    }
  }`

// Utility function to extract error from GraphQL response
const extractUpdateError = (error: any) => {
  return CombinedGraphQLErrors.is(error)
    ? error.errors.find((x: any) => x.path === undefined || x.path?.length === 1)
    : error
}

// Utility function to filter GraphQL errors for display
const filterGraphQLErrors = (error: any) => {
  return CombinedGraphQLErrors.is(error)
    ? error.errors.filter((x: any) => x.path === undefined || x.path?.length === 1)
    : [error]
}

// Component for item not found state
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

// Component for delete confirmation dialog
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
  const [deleteItem] = useMutation(buildDeleteMutation(list), { variables: { id: itemId } })

  const handleDelete = useCallback(async () => {
    try {
      await deleteItem()
      handleDeleteSuccess(list)
      navigateAfterDelete(list)
    } catch (err: any) {
      setErrorDialogValue(err)
      toastQueue.critical('Unable to delete item', {
        actionLabel: 'Details',
        onAction: () => setErrorDialogValue(err),
        shouldCloseOnAction: true,
      })
    }
  }, [deleteItem, list])

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={handleDelete}
        >
          <Text>
            Are you sure you want to delete <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>
            ? This action cannot be undone.
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

// Component for reset confirmation dialog
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

// Hook to extract and merge field/action configuration
function useFieldAndActionConfig(
  list: ListMeta,
  data: any
): FieldConfig & ActionConfig {
  return useMemo(() => {
    const actionModes = Object.fromEntries(
      Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
    )
    const fieldModes = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
    )
    const fieldPositions = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
    )
    const isRequireds = Object.fromEntries(
      Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
    )

    // Merge with dynamic metadata
    for (const field of data?.keystone?.adminMeta?.list?.fields ?? []) {
      if (!field?.itemView || !field.key) continue
      if (field.itemView.fieldMode) fieldModes[field.key] = field.itemView.fieldMode
      if (field.itemView.fieldPosition) fieldPositions[field.key] = field.itemView.fieldPosition
      if (field.itemView.isRequired) isRequireds[field.key] = field.itemView.isRequired
    }

    for (const action of data?.keystone?.adminMeta?.list?.actions ?? []) {
      if (!action?.itemView?.actionMode || !action.key) continue
      actionModes[action.key] = action.itemView.actionMode
    }

    const actionsInContext = list.actions
      .map(action => ({
        ...action,
        itemView: {
          ...action.itemView,
          actionMode: actionModes[action.key],
        },
      }))
      .filter(action => action.itemView.actionMode !== 'hidden')

    return {
      actionsInContext,
      fieldModes,
      fieldPositions,
      isRequireds,
    }
  }, [data?.keystone?.adminMeta, list.actions, list.fields])
}

// Component for item form
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
  const [value, setValue] = useState(() => initialValue)
  const [forceValidation, setForceValidation] = useState(false)

  const [update, { loading, error }] = useMutation(buildUpdateMutation(list), {
    errorPolicy: 'all',
  })

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const resetValueState = useCallback(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    resetValueState()
  }, [initialValue, resetValueState])

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()

    const newForceValidation = invalidFields.size !== 0
    setForceValidation(newForceValidation)
    if (newForceValidation) return

    const { error: _error } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const error = extractUpdateError(_error)
    if (error) {
      setUpdateError(new Error(error.message))
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(error.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })

    onSaveSuccess()
  })

  const handleFieldChange = useCallback((newValue: any) => setValue(newValue), [])

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice errors={filterGraphQLErrors(error)} />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={handleFieldChange}
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
            onChange={handleFieldChange}
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
          {!list.hideDelete && (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          )}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

// Component for item not found messages
function ItemNotFoundMessage({
  list,
  itemId,
}: {
  list: ListMeta
  itemId: string | undefined
}) {
  if (list.isSingleton) {
    return itemId === '1' ? (
      <ItemNotFound>
        <Text>"{list.label}" doesn't exist, or you don't have access to it.</Text>
        {!list.hideCreate && <CreateButtonLink list={list} />}
      </ItemNotFound>
    ) : (
      <ItemNotFound>
        <Text>
          An item with ID <strong>"{itemId}"</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>"{itemId}"</strong> doesn't exist, or you don't have access to
        it.
      </Text>
    </ItemNotFound>
  )
}

// Hook to handle item page navigation
function useItemPageNavigation(list: ListMeta, itemId: string | undefined) {
  return useCallback(
    (action: ActionMeta, resultId: string | null) => {
      const { navigation } = action.itemView

      if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
        // Refetch handled by parent
      } else if (navigation === 'follow' && resultId