import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { DevelopmentCard } from '../game-state'
import PurchasePaymentSheet from './PurchasePaymentSheet.vue'

const card: DevelopmentCard = { id:'c1',level:1,code:'c1',cost:{white:2},bonus:'blue',color:'blue',points:0,crowns:0,effects:[],isSpecial:false,imagePath:'' }
const player = (white:number) => ({ id:'p1',name:'玩家',gems:{white,gold:2},bonus:{},reservedCards:[],developmentCards:[],privilegeTokens:0,crowns:0,nobles:[],points:0,isHost:false,lastActive:'' })
let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())
const open = async (white:number) => { wrapper=mount(PurchasePaymentSheet,{props:{visible:false,title:'购买发展卡',message:'请确认',selectedCard:card,playerData:player(white)}}); await wrapper.setProps({visible:true}); await flushPromises() }
const payment = async () => { const button=wrapper!.find('.dialog-footer .btn-primary'); expect(button.attributes('disabled')).toBeUndefined(); await button.trigger('click'); return (wrapper!.emitted('confirm')!.at(-1)![0] as { paymentPlan: unknown }).paymentPlan }

describe('PurchasePaymentSheet',()=>{
  it('uses colored gems when resources arrive before opening',async()=>{await open(2);expect(await payment()).toEqual({white:2,gold:0})})
  it('recalculates from delayed authoritative resources',async()=>{await open(1);expect(await payment()).toEqual({white:1,gold:1});await wrapper!.setProps({playerData:player(2)});await flushPromises();expect(await payment()).toEqual({white:2,gold:0})})
  it('preserves manual gold substitution on an equal resource snapshot',async()=>{await open(2);await wrapper!.find('.token-item.clickable').trigger('click');expect(await payment()).toEqual({white:1,gold:1});await wrapper!.setProps({playerData:{...player(2),points:1},selectedCard:{...card}});await flushPromises();expect(await payment()).toEqual({white:1,gold:1})})
  it('resets the same card to the latest default when reopened',async()=>{await open(1);await wrapper!.setProps({visible:false});await wrapper!.setProps({visible:true,playerData:player(2)});await flushPromises();expect(await payment()).toEqual({white:2,gold:0})})
  it('supports keyboard gold conversion and emits the exact purchase boundary',async()=>{await open(2);await wrapper!.find('.token-item.clickable').trigger('keydown',{key:'Enter'});await payment();expect(wrapper!.emitted('confirm')!.at(-1)![0]).toEqual({actionType:'buyCard',selectedGems:[],selectedCard:card,privilegeCount:0,paymentPlan:{white:1,gold:1},stealGemType:null})})
  it('is a named cancellable modal with neutral image fallbacks',async()=>{await open(2);const dialog=wrapper!.find('.dialog-content');expect(dialog.attributes('aria-labelledby')).toBe('purchase-payment-title');await dialog.trigger('keydown',{key:'Escape'});expect(wrapper!.emitted('cancel')).toHaveLength(1);await wrapper!.find('.token-icon').trigger('error');expect(wrapper!.find('.gem-image-fallback').attributes('role')).toBe('img')})
})
