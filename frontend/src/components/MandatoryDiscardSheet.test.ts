import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MandatoryDiscardSheet from './MandatoryDiscardSheet.vue'
const player={id:'p1',name:'玩家',gems:{white:3,blue:2,green:2,red:2,black:1,pearl:1,gold:1},bonus:{},reservedCards:[],developmentCards:[],privilegeTokens:0,crowns:0,nobles:[],points:0,isHost:false,lastActive:''}
let wrapper:VueWrapper|undefined
afterEach(()=>wrapper?.unmount())
const open=()=>wrapper=mount(MandatoryDiscardSheet,{props:{visible:true,title:'丢弃宝石',message:'必须丢弃',playerData:player,gemDiscardTarget:10}})
describe('MandatoryDiscardSheet',()=>{
  it('cannot be closed with Escape and exposes no close button',async()=>{open();await wrapper!.find('.dialog-content').trigger('keydown',{key:'Escape'});expect(wrapper!.emitted('cancel')).toBeUndefined();expect(wrapper!.find('.close-btn').exists()).toBe(false)})
  it('only confirms at the exact target and preserves batch-before-completed order',async()=>{open();const confirm=wrapper!.find('.btn-primary');expect(confirm.attributes('disabled')).toBeDefined();await wrapper!.findAll('.gem-item')[0].trigger('click');await wrapper!.findAll('.gem-item')[0].trigger('click');expect(confirm.attributes('disabled')).toBeUndefined();await confirm.trigger('click');expect(wrapper!.emitted('discardGemsBatch')![0][0]).toEqual({gemDiscards:{white:2}});expect(wrapper!.emitted('confirm')![0][0]).toEqual({actionType:'discardGems',completed:true})})
  it('locks every discard target after reaching the exact target',async()=>{open();const white=wrapper!.findAll('.gem-item')[0];await white.trigger('click');await white.trigger('click');expect(wrapper!.findAll('.gem-item').every(item=>item.attributes('aria-disabled')==='true')).toBe(true);await white.trigger('click');expect(wrapper!.text()).toContain('已选择丢弃: 白色: 2')})
  it('reports an overlay close attempt for the authoritative 500ms reopen path',async()=>{open();await wrapper!.find('.dialog-overlay').trigger('click');expect(wrapper!.emitted('cancel')![0][0]).toEqual({actionType:'discardGems',closed:true})})
  it('resets local selection and notifies the page boundary',async()=>{open();await wrapper!.findAll('.gem-item')[0].trigger('click');await wrapper!.find('.btn-warning').trigger('click');expect(wrapper!.text()).toContain('当前总数: 12');expect(wrapper!.emitted('reset')).toHaveLength(1)})
})
