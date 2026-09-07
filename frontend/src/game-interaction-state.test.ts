import { describe, expect, it } from 'vitest'
import {
  createGameInteractionState,
  toActionDialogView,
  toRequestFeedbackView,
  transitionGameInteraction,
  type GameInteractionEvent,
  type GameInteractionState,
  type NobleChoiceContext
} from './game-interaction-state'

const card = { id: 'flow-card', bonus: 'blue', color: 'blue' }
const paymentPlan = { white: 1, gold: 0 }
const nobleContext: NobleChoiceContext = {
  playerData: { ownedNobles: [], availableNobles: ['noble1', 'noble2'] }
}

const apply = (state: GameInteractionState, event: GameInteractionEvent) =>
  transitionGameInteraction(state, event)

const openPurchase = (): GameInteractionState => apply(createGameInteractionState(), {
  type: 'OPEN_PURCHASE_PAYMENT',
  title: '购买发展卡',
  card
}).state

const confirmPurchase = (effects: readonly string[], context?: NobleChoiceContext) => apply(openPurchase(), {
  type: 'CONFIRM_PURCHASE_PAYMENT',
  card,
  paymentPlan,
  effects,
  extraTokenMessage: '选择额外 token',
  stealPlayerData: { opponent: { gems: { green: 1 } } },
  wildcardPlayerData: { bonus: { white: 1 } },
  ...(context ? { nobleContext: context } : {})
})

describe('game interaction action transitions', () => {
  it.each([
    [{ type: 'OPEN_TAKE_GEMS', message: '请选择宝石' } as const, 'take-gems', 'takeGems'],
    [{ type: 'OPEN_SPEND_PRIVILEGE' } as const, 'spend-privilege', 'spendPrivilege'],
    [{ type: 'OPEN_RESERVE_CARD', selectedGold: { x: 1, y: 2 } } as const, 'reserve-card', 'reserveCard'],
    [{ type: 'OPEN_REFILL_CONFIRM' } as const, 'refill-confirm', 'refillBoard'],
    [{ type: 'OPEN_PURCHASE_PAYMENT', title: '购买发展卡', card } as const, 'purchase-payment', 'buyCard']
  ])('opens idle into %s', (event, kind, actionType) => {
    const result = apply(createGameInteractionState(), event)
    expect(result.state.action.kind).toBe(kind)
    expect(toActionDialogView(result.state.action)).toMatchObject({ visible: true, actionType })
    expect(result.commands).toEqual([])
  })

  it('keeps the warning confirmation and grant/take command order', () => {
    const take = apply(createGameInteractionState(), { type: 'OPEN_TAKE_GEMS', message: '请选择宝石' }).state
    const warning = apply(take, {
      type: 'CONFIRM_TAKE_GEMS',
      selectedGems: [
        { x: 0, y: 0, type: 'white' },
        { x: 0, y: 1, type: 'white' },
        { x: 0, y: 2, type: 'white' }
      ],
      grantsPrivilege: true,
      privilegeMessage: '对手获得特权'
    })
    expect(warning.state.action.kind).toBe('confirm-take-gems-grant-privilege')
    expect(warning.commands).toEqual([])

    const confirmed = apply(warning.state, { type: 'CONFIRM_TAKE_GEMS_GRANT_PRIVILEGE' })
    expect(confirmed.commands).toEqual([
      { actionType: 'grantOpponentPrivilege', data: {} },
      { actionType: 'takeGems', data: { gemPositions: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] } }
    ])
  })

  it.each([
    [['extra_token', 'steal', 'wildcard'], 'extra-token'],
    [['steal'], 'steal-token'],
    [['wildcard'], 'wildcard'],
    [[], 'noble']
  ])('selects the existing purchase follow-up for effects %s', (effects, expectedKind) => {
    const result = confirmPurchase(effects, effects.length === 0 ? nobleContext : undefined)
    expect(result.state.action.kind).toBe(expectedKind)
    expect(result.commands).toEqual([])
  })

  it('submits a direct purchase once when no follow-up applies', () => {
    const result = confirmPurchase([])
    expect(result.state.action.kind).toBe('idle')
    expect(result.commands).toEqual([{
      actionType: 'buyCard',
      data: { cardId: 'flow-card', paymentPlan, effects: {} }
    }])
  })

  it('preserves explicit skipped effects', () => {
    const extra = confirmPurchase(['extra_token']).state
    const skippedExtra = apply(extra, { type: 'CONFIRM_EXTRA_TOKEN', selectedGems: [] })
    expect(skippedExtra.commands[0].data).toEqual({
      cardId: 'flow-card', paymentPlan, effects: { extraToken: { skipped: true } }
    })

    const steal = confirmPurchase(['steal']).state
    const skippedSteal = apply(steal, { type: 'CONFIRM_STEAL_TOKEN', stealGemType: null })
    expect(skippedSteal.commands[0].data).toEqual({
      cardId: 'flow-card', paymentPlan, effects: { steal: { skipped: true } }
    })
  })

  it('keeps wildcard confirmation deferred until the zero-delay follow-up', () => {
    const wildcard = confirmPurchase(['wildcard']).state
    const selected = apply(wildcard, { type: 'CONFIRM_WILDCARD', wildcardColor: 'white' })
    expect(selected.commands).toEqual([])
    expect(selected.schedulePurchaseFollowup).toBe(true)
    expect(toActionDialogView(selected.state.action).visible).toBe(false)

    const followedUp = apply(selected.state, { type: 'RUN_PURCHASE_FOLLOWUP' })
    expect(followedUp.commands).toEqual([{
      actionType: 'buyCard',
      data: { cardId: 'flow-card', paymentPlan, effects: { wildcard: { color: 'white' } } }
    }])
  })

  it('keeps noble1 steal confirmation as one final buyCard action', () => {
    const noble = confirmPurchase([], nobleContext).state
    const steal = apply(noble, {
      type: 'CONFIRM_NOBLE',
      nobleId: 'noble1',
      stealPlayerData: { opponent: { gems: { green: 1 } } }
    })
    expect(steal.state.action.kind).toBe('steal-token')
    const confirmed = apply(steal.state, { type: 'CONFIRM_STEAL_TOKEN', stealGemType: 'green' })
    expect(confirmed.commands).toEqual([{
      actionType: 'buyCard',
      data: {
        cardId: 'flow-card',
        paymentPlan,
        effects: { noble: { id: 'noble1' }, steal: { gemType: 'green' } }
      }
    }])
  })

  it('returns noble1 steal cancellation to noble selection and clears the staged noble', () => {
    const noble = confirmPurchase([], nobleContext).state
    const steal = apply(noble, { type: 'CONFIRM_NOBLE', nobleId: 'noble1' }).state
    const canceled = apply(steal, { type: 'CANCEL_ACTION' })
    expect(canceled.state.action.kind).toBe('noble')
    if (canceled.state.action.kind === 'noble') {
      expect(canceled.state.action.effects).toEqual({})
      expect(canceled.state.action.context).toEqual(nobleContext)
    }
  })
})

describe('mandatory discard authority transitions', () => {
  it('opens, closes abnormally, reopens after authority check, and resets', () => {
    const opened = apply(createGameInteractionState(), {
      type: 'AUTHORITY_REQUIRES_DISCARD',
      playerData: { gems: { white: 12 } }
    })
    expect(toActionDialogView(opened.state.action)).toMatchObject({ visible: true, actionType: 'discardGems' })

    const closed = apply(opened.state, { type: 'CANCEL_ACTION' })
    expect(toActionDialogView(closed.state.action).visible).toBe(false)
    const reopened = apply(closed.state, { type: 'REOPEN_MANDATORY_DISCARD' })
    expect(toActionDialogView(reopened.state.action).visible).toBe(true)
    const reset = apply(reopened.state, { type: 'RESET_MANDATORY_DISCARD' })
    expect(reset.state.action.kind).toBe('idle')
  })

  it('completes with endTurn and prevents the timer transition from reopening', () => {
    const opened = apply(createGameInteractionState(), { type: 'AUTHORITY_REQUIRES_DISCARD' }).state
    const completed = apply(opened, { type: 'COMPLETE_MANDATORY_DISCARD' })
    expect(completed.commands).toEqual([{ actionType: 'endTurn', data: {} }])
    expect(toActionDialogView(completed.state.action).visible).toBe(false)
    const timerResult = apply(completed.state, { type: 'REOPEN_MANDATORY_DISCARD' })
    expect(toActionDialogView(timerResult.state.action).visible).toBe(false)
  })
})

describe('request feedback and victory projections', () => {
  it.each([
    [{ type: 'REQUEST_SENT', requestId: 'r1', actionType: 'takeGems' } as const, 'pending', '请求已发送'],
    [{ type: 'REQUEST_UNKNOWN', requestId: 'r1', actionType: 'takeGems' } as const, 'unknown', '操作结果未知'],
    [{ type: 'ACK_SUCCESS', requestId: 'r1', actionType: 'takeGems' } as const, 'ack-success', '操作成功'],
    [{ type: 'ACK_FAILURE', requestId: 'r1', actionType: 'takeGems', message: '规则拒绝' } as const, 'ack-failure', '操作失败']
  ])('maps %s to stable page feedback', (event, kind, title) => {
    const result = apply(createGameInteractionState(), event)
    expect(result.state.feedback.kind).toBe(kind)
    expect(toRequestFeedbackView(result.state.feedback)?.title).toBe(title)
  })

  it('keeps the server failure message and success replay wording', () => {
    const failed = apply(createGameInteractionState(), {
      type: 'ACK_FAILURE', requestId: 'r1', actionType: 'buyCard', message: '规则拒绝'
    }).state
    expect(toRequestFeedbackView(failed.feedback)?.message).toBe('规则拒绝')

    const replayed = apply(failed, {
      type: 'ACK_SUCCESS', requestId: 'r1', actionType: 'buyCard', replayed: true
    }).state
    expect(toRequestFeedbackView(replayed.feedback)?.message).toBe('服务器已确认该操作此前完成')
  })

  it('models victory independently from the active action', () => {
    const taking = apply(createGameInteractionState(), { type: 'OPEN_TAKE_GEMS', message: '请选择宝石' }).state
    const won = apply(taking, { type: 'SHOW_VICTORY', message: '本地玩家获得胜利' }).state
    expect(won.action.kind).toBe('take-gems')
    expect(won.victory).toEqual({ kind: 'victory', message: '本地玩家获得胜利' })
    expect(apply(won, { type: 'CLOSE_VICTORY' }).state.victory.kind).toBe('idle')
  })
})
