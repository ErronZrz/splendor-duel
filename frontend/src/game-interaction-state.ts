import type { BoardPosition, GameActionPayloadMap, GameActionType, PaymentPlan, PurchaseEffects } from './protocol'

export type GemPosition = BoardPosition

export interface SelectedGem extends GemPosition {
  type: string
}

export interface InteractionCard {
  id: string
  bonus?: string
  color?: string
  effects?: readonly string[]
}

export type ReserveTarget =
  | { type: 'market-card'; cardId: string; level: number; name: string }
  | { type: 'deck'; level: number }

export interface PendingPurchase {
  card: InteractionCard
  paymentPlan: PaymentPlan
}

export interface NobleChoiceContext {
  playerData: {
    ownedNobles: string[]
    availableNobles: string[]
  }
}

export type ActionInteractionState =
  | { kind: 'idle' }
  | { kind: 'take-gems'; message: string; selectedGems: SelectedGem[]; warning: string | null }
  | { kind: 'spend-privilege'; message: string; targetCount: number; maxPrivilegeCount: number; selectedGems: SelectedGem[] }
  | { kind: 'reserve-card'; selectedGold: GemPosition; target: ReserveTarget | null }
  | { kind: 'refill-confirm' }
  | { kind: 'purchase-payment'; title: string; card: InteractionCard | null; playerData?: unknown }
  | { kind: 'extra-token'; purchase: PendingPurchase; effects: PurchaseEffects; message: string; selectedGem?: SelectedGem; playerData?: unknown }
  | { kind: 'steal-token'; purchase: PendingPurchase; effects: PurchaseEffects; selectedGemType?: string; playerData?: unknown; returnToNoble: boolean; nobleContext?: NobleChoiceContext }
  | { kind: 'wildcard'; purchase: PendingPurchase; effects: PurchaseEffects; selectedColor?: string; playerData?: unknown; phase: 'selecting' | 'awaiting-followup' }
  | { kind: 'noble'; purchase: PendingPurchase; effects: PurchaseEffects; selectedNobleId?: string; context: NobleChoiceContext }
  | { kind: 'mandatory-discard'; open: boolean; completed: boolean; playerData?: unknown }

export type RequestFeedbackState =
  | { kind: 'idle' }
  | { kind: 'pending'; requestId: string; actionType: string }
  | { kind: 'unknown'; requestId: string; actionType: string }
  | { kind: 'ack-success'; requestId: string; actionType: string; replayed: boolean }
  | { kind: 'ack-failure'; requestId: string; actionType: string; message: string }

export type VictoryInteractionState =
  | { kind: 'idle' }
  | { kind: 'victory'; message: string }

export interface GameInteractionState {
  action: ActionInteractionState
  feedback: RequestFeedbackState
  victory: VictoryInteractionState
}

export type InteractionCommand = {
  [K in GameActionType]: { actionType: K; data: GameActionPayloadMap[K] }
}[GameActionType]

export interface InteractionTransition {
  state: GameInteractionState
  commands: InteractionCommand[]
  schedulePurchaseFollowup: boolean
}

export type GameInteractionEvent =
  | { type: 'OPEN_TAKE_GEMS'; message: string; initialGemPosition?: SelectedGem }
  | { type: 'OPEN_SPEND_PRIVILEGE'; maxPrivilegeCount: number }
  | { type: 'SELECT_BOARD_GEM'; gem: SelectedGem }
  | { type: 'DESELECT_BOARD_GEM'; position: GemPosition }
  | { type: 'CLEAR_BOARD_GEMS' }
  | { type: 'SET_PRIVILEGE_COUNT'; count: number }
  | { type: 'OPEN_RESERVE_CARD'; selectedGold: GemPosition }
  | { type: 'TOGGLE_RESERVE_TARGET'; target: ReserveTarget }
  | { type: 'CLEAR_RESERVE_TARGET' }
  | { type: 'OPEN_REFILL_CONFIRM' }
  | { type: 'OPEN_PURCHASE_PAYMENT'; title: string; card: InteractionCard | null; playerData?: unknown }
  | { type: 'CONFIRM_TAKE_GEMS' }
  | { type: 'CONFIRM_SPEND_PRIVILEGE' }
  | { type: 'CONFIRM_RESERVE_CARD' }
  | { type: 'CONFIRM_REFILL_BOARD' }
  | { type: 'CONFIRM_PURCHASE_PAYMENT'; card: InteractionCard; paymentPlan: PaymentPlan; effects: readonly string[]; extraTokenMessage: string; extraTokenPlayerData?: unknown; stealPlayerData?: unknown; wildcardPlayerData?: unknown; nobleContext?: NobleChoiceContext }
  | { type: 'SELECT_EXTRA_TOKEN'; gem: SelectedGem }
  | { type: 'SELECT_STEAL_TOKEN'; gemType: string }
  | { type: 'SELECT_WILDCARD'; color: string }
  | { type: 'SELECT_NOBLE'; nobleId: string }
  | { type: 'CLEAR_PURCHASE_EFFECT_SELECTION' }
  | { type: 'CONFIRM_EXTRA_TOKEN'; selectedGems: SelectedGem[]; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_STEAL_TOKEN'; stealGemType: string | null; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_WILDCARD'; wildcardColor: string }
  | { type: 'RUN_PURCHASE_FOLLOWUP'; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_NOBLE'; nobleId: string; stealPlayerData?: unknown }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AUTHORITY_REQUIRES_DISCARD'; playerData?: unknown }
  | { type: 'REOPEN_MANDATORY_DISCARD'; playerData?: unknown }
  | { type: 'RESET_MANDATORY_DISCARD' }
  | { type: 'COMPLETE_MANDATORY_DISCARD' }
  | { type: 'AUTHORITATIVE_TURN_RESUMED' }
  | { type: 'REQUEST_SENT'; requestId: string; actionType: string }
  | { type: 'REQUEST_UNKNOWN'; requestId: string; actionType: string }
  | { type: 'ACK_SUCCESS'; requestId: string; actionType: string; replayed?: boolean }
  | { type: 'ACK_FAILURE'; requestId: string; actionType: string; message?: string }
  | { type: 'SHOW_VICTORY'; message: string }
  | { type: 'CLOSE_VICTORY' }

export interface ActionDialogView {
  visible: boolean
  actionType: string
  title: string
  message: string
  selectedCard: InteractionCard | null
  selectedGold?: GemPosition
  initialGemPosition?: SelectedGem
  playerData?: unknown
}

export interface RequestFeedbackView {
  tone: 'info' | 'success' | 'error' | 'warning'
  title: string
  message: string
}

export interface ContextActionBarView {
  mode: 'take-gems' | 'spend-privilege' | 'reserve-card' | 'refill-confirm' | 'extra-token' | 'steal-token' | 'wildcard' | 'noble'
  message: string
  selectedGems: SelectedGem[]
  selectedGold: GemPosition | null
  reserveTarget: ReserveTarget | null
  warning: string | null
  targetCount: number
  maxPrivilegeCount: number
  confirmDisabled: boolean
  allowSkip?: boolean
  selectionLabel?: string
}

const noCommands = (state: GameInteractionState): InteractionTransition => ({
  state,
  commands: [],
  schedulePurchaseFollowup: false
})

const withAction = (
  state: GameInteractionState,
  action: ActionInteractionState,
  commands: InteractionCommand[] = [],
  schedulePurchaseFollowup = false
): InteractionTransition => ({
  state: { ...state, action },
  commands,
  schedulePurchaseFollowup
})

const buyCardCommand = (purchase: PendingPurchase, effects: PurchaseEffects): InteractionCommand => ({
  actionType: 'buyCard',
  data: {
    cardId: purchase.card.id,
    paymentPlan: purchase.paymentPlan,
    effects
  }
})

const completePurchaseStep = (
  state: GameInteractionState,
  purchase: PendingPurchase,
  effects: PurchaseEffects,
  nobleContext?: NobleChoiceContext
): InteractionTransition => {
  if (nobleContext) {
    return withAction(state, { kind: 'noble', purchase, effects, context: nobleContext })
  }
  return withAction(state, { kind: 'idle' }, [buyCardCommand(purchase, effects)])
}

const samePosition = (left: GemPosition, right: GemPosition): boolean =>
  left.x === right.x && left.y === right.y

const sameReserveTarget = (left: ReserveTarget, right: ReserveTarget): boolean =>
  left.type === right.type && (left.type === 'deck'
    ? right.type === 'deck' && left.level === right.level
    : right.type === 'market-card' && left.cardId === right.cardId)

const isValidReserveTarget = (target: ReserveTarget): boolean =>
  Number.isInteger(target.level) && target.level >= 1 && target.level <= 3 &&
  (target.type === 'deck' || target.cardId.length > 0)

const isSelectableGem = (gem: SelectedGem): boolean => gem.type.length > 0 && gem.type !== 'gold'

export const isValidTakeGemSelection = (selectedGems: readonly SelectedGem[]): boolean => {
  if (selectedGems.length < 1 || selectedGems.length > 3 || selectedGems.some(gem => !isSelectableGem(gem))) {
    return false
  }
  if (selectedGems.some((gem, index) => selectedGems.slice(index + 1).some(other => samePosition(gem, other)))) {
    return false
  }
  if (selectedGems.length === 1) return true

  const sameRow = selectedGems.every(gem => gem.x === selectedGems[0].x)
  if (sameRow) {
    const columns = selectedGems.map(gem => gem.y).sort((left, right) => left - right)
    return columns.every((column, index) => index === 0 || column === columns[index - 1] + 1)
  }

  const sameColumn = selectedGems.every(gem => gem.y === selectedGems[0].y)
  if (sameColumn) {
    const rows = selectedGems.map(gem => gem.x).sort((left, right) => left - right)
    return rows.every((row, index) => index === 0 || row === rows[index - 1] + 1)
  }

  const sameDescendingDiagonal = selectedGems.every(gem => gem.x - gem.y === selectedGems[0].x - selectedGems[0].y)
  const sameAscendingDiagonal = selectedGems.every(gem => gem.x + gem.y === selectedGems[0].x + selectedGems[0].y)
  if (!sameDescendingDiagonal && !sameAscendingDiagonal) return false
  const rows = selectedGems.map(gem => gem.x).sort((left, right) => left - right)
  return rows.every((row, index) => index === 0 || row === rows[index - 1] + 1)
}

export const getTakeGemsPrivilegeWarning = (selectedGems: readonly SelectedGem[]): string | null => {
  if (selectedGems.length === 3 && selectedGems.every(gem => gem.type === selectedGems[0].type)) {
    return '拿取 3 个同色宝石，对手将获得特权'
  }
  if (selectedGems.filter(gem => gem.type === 'pearl').length >= 2) {
    return '拿取 2 枚珍珠，对手将获得特权'
  }
  return null
}

const boardPositions = (board: readonly (readonly string[])[]): SelectedGem[] =>
  board.flatMap((row, x) => row.map((type, y) => ({ x, y, type })))

export const getSelectableGemPositions = (
  board: readonly (readonly string[])[],
  action: ActionInteractionState
): GemPosition[] => {
  if (action.kind === 'extra-token') {
    const color = action.purchase.card.bonus || action.purchase.card.color
    return boardPositions(board).filter(gem => gem.type !== 'gold' && gem.type === color).map(({ x, y }) => ({ x, y }))
  }
  if (action.kind !== 'take-gems' && action.kind !== 'spend-privilege') return []
  const limit = action.kind === 'take-gems' ? 3 : action.targetCount
  if (action.selectedGems.length >= limit) return []

  return boardPositions(board)
    .filter(gem => isSelectableGem(gem))
    .filter(gem => !action.selectedGems.some(selected => samePosition(selected, gem)))
    .filter(gem => action.kind === 'spend-privilege' || isValidTakeGemSelection([...action.selectedGems, gem]))
    .map(({ x, y }) => ({ x, y }))
}

export const getIllegalGemPositions = (
  board: readonly (readonly string[])[],
  action: ActionInteractionState
): GemPosition[] => {
  const selected = action.kind === 'take-gems' || action.kind === 'spend-privilege' ? action.selectedGems : action.kind === 'extra-token' && action.selectedGem ? [action.selectedGem] : []
  const selectable = getSelectableGemPositions(board, action)
  return boardPositions(board)
    .filter(position => !selected.some(gem => samePosition(gem, position)))
    .filter(position => !selectable.some(gem => samePosition(gem, position)))
    .map(({ x, y }) => ({ x, y }))
}

const isValidSpendPrivilegeSelection = (selectedGems: readonly SelectedGem[], targetCount: number): boolean =>
  selectedGems.length === targetCount &&
  selectedGems.every(isSelectableGem) &&
  !selectedGems.some((gem, index) => selectedGems.slice(index + 1).some(other => samePosition(gem, other)))

const boardInteractionLocked = (state: GameInteractionState): boolean =>
  state.feedback.kind === 'pending' || state.feedback.kind === 'unknown'

export const createGameInteractionState = (): GameInteractionState => ({
  action: { kind: 'idle' },
  feedback: { kind: 'idle' },
  victory: { kind: 'idle' }
})

export const transitionGameInteraction = (
  state: GameInteractionState,
  event: GameInteractionEvent
): InteractionTransition => {
  switch (event.type) {
    case 'OPEN_TAKE_GEMS': {
      if (boardInteractionLocked(state)) return noCommands(state)
      const selectedGems = event.initialGemPosition && isSelectableGem(event.initialGemPosition)
        ? [event.initialGemPosition]
        : []
      return withAction(state, {
        kind: 'take-gems',
        message: event.message,
        selectedGems,
        warning: getTakeGemsPrivilegeWarning(selectedGems)
      })
    }
    case 'OPEN_SPEND_PRIVILEGE': {
      if (boardInteractionLocked(state)) return noCommands(state)
      const maxPrivilegeCount = Math.max(1, Math.min(3, event.maxPrivilegeCount))
      return withAction(state, {
        kind: 'spend-privilege',
        message: '请选择要花费的特权数量，并在棋盘选择相同数量的非黄金宝石。',
        targetCount: 1,
        maxPrivilegeCount,
        selectedGems: []
      })
    }
    case 'SELECT_BOARD_GEM': {
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      if (!isSelectableGem(event.gem) || state.action.selectedGems.some(gem => samePosition(gem, event.gem))) {
        return noCommands(state)
      }
      if (state.action.kind === 'take-gems') {
        const selectedGems = [...state.action.selectedGems, event.gem]
        if (!isValidTakeGemSelection(selectedGems)) return noCommands(state)
        return withAction(state, {
          ...state.action,
          selectedGems,
          warning: getTakeGemsPrivilegeWarning(selectedGems)
        })
      }
      if (state.action.selectedGems.length >= state.action.targetCount) return noCommands(state)
      return withAction(state, { ...state.action, selectedGems: [...state.action.selectedGems, event.gem] })
    }
    case 'DESELECT_BOARD_GEM': {
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      const selectedGems = state.action.selectedGems.filter(gem => !samePosition(gem, event.position))
      return state.action.kind === 'take-gems'
        ? withAction(state, { ...state.action, selectedGems, warning: getTakeGemsPrivilegeWarning(selectedGems) })
        : withAction(state, { ...state.action, selectedGems })
    }
    case 'CLEAR_BOARD_GEMS':
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      return state.action.kind === 'take-gems'
        ? withAction(state, { ...state.action, selectedGems: [], warning: null })
        : withAction(state, { ...state.action, selectedGems: [] })
    case 'SET_PRIVILEGE_COUNT':
      if (boardInteractionLocked(state) || state.action.kind !== 'spend-privilege') return noCommands(state)
      if (event.count < 1 || event.count > state.action.maxPrivilegeCount || event.count === state.action.targetCount) {
        return noCommands(state)
      }
      return withAction(state, { ...state.action, targetCount: event.count, selectedGems: [] })
    case 'OPEN_RESERVE_CARD':
      if (boardInteractionLocked(state) || state.action.kind !== 'idle') return noCommands(state)
      return withAction(state, { kind: 'reserve-card', selectedGold: event.selectedGold, target: null })
    case 'TOGGLE_RESERVE_TARGET':
      if (boardInteractionLocked(state) || state.action.kind !== 'reserve-card' || !isValidReserveTarget(event.target)) {
        return noCommands(state)
      }
      return withAction(state, {
        ...state.action,
        target: state.action.target && sameReserveTarget(state.action.target, event.target) ? null : event.target
      })
    case 'CLEAR_RESERVE_TARGET':
      if (boardInteractionLocked(state) || state.action.kind !== 'reserve-card' || !state.action.target) return noCommands(state)
      return withAction(state, { ...state.action, target: null })
    case 'OPEN_REFILL_CONFIRM':
      if (boardInteractionLocked(state) || state.action.kind !== 'idle') return noCommands(state)
      return withAction(state, { kind: 'refill-confirm' })
    case 'OPEN_PURCHASE_PAYMENT':
      return withAction(state, {
        kind: 'purchase-payment',
        title: event.title,
        card: event.card,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'CONFIRM_TAKE_GEMS': {
      if (boardInteractionLocked(state) || state.action.kind !== 'take-gems' || !isValidTakeGemSelection(state.action.selectedGems)) {
        return noCommands(state)
      }
      const gemPositions = state.action.selectedGems.map(({ x, y }) => ({ x, y }))
      const commands: InteractionCommand[] = state.action.warning
        ? [
            { actionType: 'grantOpponentPrivilege', data: {} },
            { actionType: 'takeGems', data: { gemPositions } }
          ]
        : [{ actionType: 'takeGems', data: { gemPositions } }]
      return withAction(state, { kind: 'idle' }, commands)
    }
    case 'CONFIRM_SPEND_PRIVILEGE':
      if (boardInteractionLocked(state) || state.action.kind !== 'spend-privilege' ||
          !isValidSpendPrivilegeSelection(state.action.selectedGems, state.action.targetCount)) {
        return noCommands(state)
      }
      return withAction(state, { kind: 'idle' }, [{
        actionType: 'spendPrivilege',
        data: {
          privilegeCount: state.action.targetCount,
          gemPositions: state.action.selectedGems.map(({ x, y }) => ({ x, y }))
        }
      }])
    case 'CONFIRM_RESERVE_CARD':
      if (boardInteractionLocked(state) || state.action.kind !== 'reserve-card' || !state.action.target) {
        return noCommands(state)
      }
      return withAction(state, { kind: 'idle' }, [{
        actionType: 'reserveCard',
        data: {
          cardId: state.action.target.type === 'deck'
            ? `deck_level_${state.action.target.level}`
            : state.action.target.cardId,
          goldX: state.action.selectedGold.x,
          goldY: state.action.selectedGold.y
        }
      }])
    case 'CONFIRM_REFILL_BOARD':
      if (boardInteractionLocked(state) || state.action.kind !== 'refill-confirm') return noCommands(state)
      return withAction(state, { kind: 'idle' }, [{ actionType: 'refillBoard', data: {} }])
    case 'CONFIRM_PURCHASE_PAYMENT': {
      if (state.action.kind !== 'purchase-payment') return noCommands(state)
      const purchase = { card: event.card, paymentPlan: event.paymentPlan }
      if (event.effects.includes('extra_token')) {
        return withAction(state, {
          kind: 'extra-token',
          purchase,
          effects: {},
          message: event.extraTokenMessage,
          ...(event.extraTokenPlayerData === undefined ? {} : { playerData: event.extraTokenPlayerData })
        })
      }
      if (event.effects.includes('steal')) {
        return withAction(state, {
          kind: 'steal-token',
          purchase,
          effects: {},
          returnToNoble: false,
          ...(event.stealPlayerData === undefined ? {} : { playerData: event.stealPlayerData })
        })
      }
      if (event.effects.includes('wildcard')) {
        return withAction(state, {
          kind: 'wildcard',
          purchase,
          effects: {},
          phase: 'selecting',
          ...(event.wildcardPlayerData === undefined ? {} : { playerData: event.wildcardPlayerData })
        })
      }
      return completePurchaseStep(state, purchase, {}, event.nobleContext)
    }
    case 'SELECT_EXTRA_TOKEN':
      if (boardInteractionLocked(state) || state.action.kind !== 'extra-token') return noCommands(state)
      return withAction(state, { ...state.action, selectedGem: event.gem })
    case 'SELECT_STEAL_TOKEN':
      if (boardInteractionLocked(state) || state.action.kind !== 'steal-token') return noCommands(state)
      return withAction(state, { ...state.action, selectedGemType: event.gemType })
    case 'SELECT_WILDCARD':
      if (boardInteractionLocked(state) || state.action.kind !== 'wildcard' || state.action.phase !== 'selecting') return noCommands(state)
      return withAction(state, { ...state.action, selectedColor: event.color })
    case 'SELECT_NOBLE':
      if (boardInteractionLocked(state) || state.action.kind !== 'noble') return noCommands(state)
      return withAction(state, { ...state.action, selectedNobleId: event.nobleId })
    case 'CLEAR_PURCHASE_EFFECT_SELECTION':
      if (boardInteractionLocked(state)) return noCommands(state)
      if (state.action.kind === 'extra-token') return withAction(state, { ...state.action, selectedGem: undefined })
      if (state.action.kind === 'steal-token') return withAction(state, { ...state.action, selectedGemType: undefined })
      if (state.action.kind === 'wildcard') return withAction(state, { ...state.action, selectedColor: undefined })
      if (state.action.kind === 'noble') return withAction(state, { ...state.action, selectedNobleId: undefined })
      return noCommands(state)
    case 'CONFIRM_EXTRA_TOKEN':
      if (state.action.kind !== 'extra-token') return noCommands(state)
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, {
        ...state.action.effects,
        extraToken: (event.selectedGems[0] || state.action.selectedGem)
          ? { selectedGem: { x: (event.selectedGems[0] || state.action.selectedGem)!.x, y: (event.selectedGems[0] || state.action.selectedGem)!.y } }
          : { skipped: true }
      }, event.nobleContext)
    case 'CONFIRM_STEAL_TOKEN': {
      if (state.action.kind !== 'steal-token') return noCommands(state)
      const effects: PurchaseEffects = {
        ...state.action.effects,
        steal: (event.stealGemType || state.action.selectedGemType) ? { gemType: (event.stealGemType || state.action.selectedGemType)! } : { skipped: true }
      }
      if (effects.noble?.id === 'noble1') {
        return withAction(state, { kind: 'idle' }, [buyCardCommand(state.action.purchase, effects)])
      }
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, effects, event.nobleContext)
    }
    case 'CONFIRM_WILDCARD':
      if (state.action.kind !== 'wildcard' || state.action.phase !== 'selecting') return noCommands(state)
      return withAction(state, {
        ...state.action,
        phase: 'awaiting-followup',
        effects: { ...state.action.effects, wildcard: { color: event.wildcardColor } }
      }, [], true)
    case 'RUN_PURCHASE_FOLLOWUP':
      if (state.action.kind !== 'wildcard' || state.action.phase !== 'awaiting-followup') return noCommands(state)
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, state.action.effects, event.nobleContext)
    case 'CONFIRM_NOBLE':
      if (state.action.kind !== 'noble') return noCommands(state)
      if (event.nobleId === 'noble1') {
        return withAction(state, {
          kind: 'steal-token',
          purchase: state.action.purchase,
          effects: { ...state.action.effects, noble: { id: event.nobleId } },
          returnToNoble: true,
          nobleContext: state.action.context,
          ...(event.stealPlayerData === undefined ? {} : { playerData: event.stealPlayerData })
        })
      }
      return withAction(state, { kind: 'idle' }, [buyCardCommand(state.action.purchase, {
        ...state.action.effects,
        noble: { id: event.nobleId }
      })])
    case 'CANCEL_ACTION':
      if (state.action.kind === 'steal-token' && state.action.returnToNoble && state.action.nobleContext) {
        const effects = { ...state.action.effects }
        delete effects.noble
        return withAction(state, {
          kind: 'noble',
          purchase: state.action.purchase,
          effects,
          context: state.action.nobleContext
        })
      }
      if (state.action.kind === 'mandatory-discard') {
        return withAction(state, { ...state.action, open: false })
      }
      return withAction(state, { kind: 'idle' })
    case 'AUTHORITY_REQUIRES_DISCARD':
      return withAction(state, {
        kind: 'mandatory-discard',
        open: true,
        completed: false,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'REOPEN_MANDATORY_DISCARD':
      if (state.action.kind !== 'mandatory-discard' || state.action.completed) return noCommands(state)
      return withAction(state, {
        ...state.action,
        open: true,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'RESET_MANDATORY_DISCARD':
      return state.action.kind === 'mandatory-discard'
        ? withAction(state, { ...state.action, open: true, completed: false })
        : noCommands(state)
    case 'COMPLETE_MANDATORY_DISCARD':
      if (state.action.kind !== 'mandatory-discard') return noCommands(state)
      return withAction(state, { ...state.action, open: false, completed: true }, [
        { actionType: 'endTurn', data: {} }
      ])
    case 'AUTHORITATIVE_TURN_RESUMED':
      // A later authoritative state has handed the turn back to this player.
      // Any old local selection/receipt lock is therefore no longer an active action.
      return withAction({ ...state, feedback: { kind: 'idle' } }, { kind: 'idle' })
    case 'REQUEST_SENT':
      return noCommands({
        ...state,
        feedback: { kind: 'pending', requestId: event.requestId, actionType: event.actionType }
      })
    case 'REQUEST_UNKNOWN':
      return noCommands({
        ...state,
        feedback: { kind: 'unknown', requestId: event.requestId, actionType: event.actionType }
      })
    case 'ACK_SUCCESS':
      return noCommands({
        ...state,
        feedback: {
          kind: 'ack-success',
          requestId: event.requestId,
          actionType: event.actionType,
          replayed: event.replayed === true
        }
      })
    case 'ACK_FAILURE':
      return noCommands({
        ...state,
        feedback: {
          kind: 'ack-failure',
          requestId: event.requestId,
          actionType: event.actionType,
          message: event.message || '服务器拒绝了该操作'
        }
      })
    case 'SHOW_VICTORY':
      return noCommands({ ...state, victory: { kind: 'victory', message: event.message } })
    case 'CLOSE_VICTORY':
      return noCommands({ ...state, victory: { kind: 'idle' } })
  }
}

export const toActionDialogView = (action: ActionInteractionState): ActionDialogView => {
  switch (action.kind) {
    case 'idle':
      return { visible: false, actionType: '', title: '', message: '', selectedCard: null }
    case 'take-gems':
    case 'spend-privilege':
    case 'reserve-card':
    case 'refill-confirm':
    case 'extra-token':
    case 'steal-token':
    case 'wildcard':
    case 'noble':
      return { visible: false, actionType: '', title: '', message: '', selectedCard: null }
    case 'purchase-payment':
      return { visible: true, actionType: 'buyCard', title: action.title, message: action.card ? '请确认要支付的token数量' : '请选择要购买的发展卡。', selectedCard: action.card, playerData: action.playerData }
    case 'mandatory-discard':
      return { visible: action.open, actionType: 'discardGems', title: '丢弃宝石', message: '您的宝石总数超过10个，请丢弃一些宝石', selectedCard: null, playerData: action.playerData }
  }
}

export const toRequestFeedbackView = (feedback: RequestFeedbackState): RequestFeedbackView | null => {
  switch (feedback.kind) {
    case 'idle':
      return null
    case 'pending':
      return { tone: 'info', title: '请求已发送', message: '正在等待服务器确认' }
    case 'unknown':
      return { tone: 'warning', title: '操作结果未知', message: '连接已中断，正在等待权威状态；不会自动重发操作' }
    case 'ack-success':
      return { tone: 'success', title: '操作成功', message: feedback.replayed ? '服务器已确认该操作此前完成' : '服务器已确认操作完成' }
    case 'ack-failure':
      return { tone: 'error', title: '操作失败', message: feedback.message }
  }
}

export const toContextActionBarView = (action: ActionInteractionState): ContextActionBarView | null => {
  if (action.kind === 'take-gems') {
    return {
      mode: action.kind,
      message: action.message,
      selectedGems: action.selectedGems,
      selectedGold: null,
      reserveTarget: null,
      warning: action.warning,
      targetCount: 3,
      maxPrivilegeCount: 3,
      confirmDisabled: !isValidTakeGemSelection(action.selectedGems)
    }
  }
  if (action.kind === 'spend-privilege') {
    return {
      mode: action.kind,
      message: action.message,
      selectedGems: action.selectedGems,
      selectedGold: null,
      reserveTarget: null,
      warning: null,
      targetCount: action.targetCount,
      maxPrivilegeCount: action.maxPrivilegeCount,
      confirmDisabled: !isValidSpendPrivilegeSelection(action.selectedGems, action.targetCount)
    }
  }
  if (action.kind === 'reserve-card') {
    return {
      mode: action.kind,
      message: '请在市场中选择一张翻开的发展卡，或选择一个非空牌堆。',
      selectedGems: [],
      selectedGold: action.selectedGold,
      reserveTarget: action.target,
      warning: null,
      targetCount: 1,
      maxPrivilegeCount: 1,
      confirmDisabled: action.target === null
    }
  }
  if (action.kind === 'refill-confirm') {
    return {
      mode: action.kind,
      message: '确认从袋中补充宝石版图。',
      selectedGems: [],
      selectedGold: null,
      reserveTarget: null,
      warning: '补充版图后，对手获得特权',
      targetCount: 0,
      maxPrivilegeCount: 0,
      confirmDisabled: false
    }
  }
  if (action.kind === 'extra-token') {
    return { mode: action.kind, message: action.message, selectedGems: action.selectedGem ? [action.selectedGem] : [], selectedGold: null, reserveTarget: null, warning: null, targetCount: 1, maxPrivilegeCount: 1, confirmDisabled: !action.selectedGem, selectionLabel: action.selectedGem ? `已选 ${action.selectedGem.type}` : undefined }
  }
  if (action.kind === 'steal-token') {
    return { mode: action.kind, message: '请从对手实际持有的 token 中选择一种颜色。', selectedGems: [], selectedGold: null, reserveTarget: null, warning: null, targetCount: 1, maxPrivilegeCount: 1, confirmDisabled: !action.selectedGemType, selectionLabel: action.selectedGemType }
  }
  if (action.kind === 'wildcard') {
    return { mode: action.kind, message: '请选择百搭发展卡要提供的优惠颜色。', selectedGems: [], selectedGold: null, reserveTarget: null, warning: null, targetCount: 1, maxPrivilegeCount: 1, confirmDisabled: !action.selectedColor || action.phase !== 'selecting', selectionLabel: action.selectedColor }
  }
  if (action.kind === 'noble') {
    return { mode: action.kind, message: '请从当前可用贵族中选择一位。', selectedGems: [], selectedGold: null, reserveTarget: null, warning: null, targetCount: 1, maxPrivilegeCount: 1, confirmDisabled: !action.selectedNobleId, selectionLabel: action.selectedNobleId }
  }
  return null
}
