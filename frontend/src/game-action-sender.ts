import type { GameActionPayloadMap, GameActionType } from './protocol'

export interface GameActionSender {
  sendGameAction<TAction extends GameActionType>(actionType: TAction, data: GameActionPayloadMap[TAction]): string
}

export const sendTypedGameAction = <TAction extends GameActionType>(
  sender: GameActionSender,
  actionType: TAction,
  data: GameActionPayloadMap[TAction]
): string => sender.sendGameAction(actionType, data)
