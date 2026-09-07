<template>
  <div v-if="visible" class="dialog-overlay" @click="handleOverlayClick">
    <div
      ref="dialogRef"
      class="dialog-content"
      :class="{ 'wide-reserve': actionType === 'reserveCard' }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-dialog-title"
      tabindex="-1"
      @click.stop
      @keydown="handleDialogKeydown"
    >
      <div class="dialog-header">
        <h3 id="action-dialog-title">{{ title }}</h3>
        <!-- 对于宝石丢弃操作，不显示关闭按钮 -->
        <button v-if="actionType !== 'discardGems'" class="close-btn" type="button" aria-label="关闭对话框" @click="handleCancel">&times;</button>
      </div>
      
      <div class="dialog-body">
        <p>{{ message }}</p>
        
        <!-- 拿取宝石操作 -->
        <div v-if="actionType === 'takeGems'" class="gem-selection">
            <h4>选择宝石 (1-3个，必须在一条直线上且连续)</h4>
            <div class="gem-selection-controls">
              <button 
                v-if="selectedGems.length > 0"
                @click="clearSelectedGems" 
                class="clear-btn"
              >
                清除选择
              </button>
            </div>
            <div class="gem-grid-preview">
              <div v-for="(row, rowIndex) in gemBoard" :key="rowIndex" class="gem-row">
                <div 
                  v-for="(gem, colIndex) in row" 
                  :key="colIndex"
                  class="gem-cell"
                  :class="{ 
                    'has-gem': gem, 
                    'selected': isGemSelected(rowIndex, colIndex),
                    'clickable': gem && !isGemSelected(rowIndex, colIndex) && selectedGems.length < 3 && gem !== 'gold'
                  }"
                  role="button"
                  :tabindex="gem && gem !== 'gold' ? 0 : -1"
                  :aria-label="gem ? `选择${getGemDisplayName(gem)}，第${rowIndex + 1}行第${colIndex + 1}列` : undefined"
                  :aria-pressed="gem && gem !== 'gold' ? isGemSelected(rowIndex, colIndex) : undefined"
                  :aria-disabled="gem && gem !== 'gold' ? (!isGemSelected(rowIndex, colIndex) && selectedGems.length >= 3) : true"
                  @click="selectGem(rowIndex, colIndex, gem)"
                  @keydown.enter.prevent="selectGem(rowIndex, colIndex, gem)"
                  @keydown.space.prevent="selectGem(rowIndex, colIndex, gem)"
                >
                  <img 
                    v-if="gem" 
                    :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                    :alt="gem"
                    class="gem-image"
                  />
                  <span v-else class="empty-cell">空</span>
                </div>
              </div>
            </div>
          </div>
        
        <!-- 购买发展卡操作 -->
        <div v-if="actionType === 'buyCard'" class="card-selection">
          <h4>购买发展卡</h4>
          <div class="buy-card-content">
            <!-- 左侧：卡牌展示 -->
            <div class="card-preview-section">
              <img 
                :src="`/images/cards/${selectedCard?.id}.jpg`" 
                :alt="selectedCard?.name" 
                class="card-preview-large"
                @error="handleCardImageError"
              />
            </div>
            
            <!-- 右侧：支付方案 -->
            <div class="payment-section">
              <h5>支付方案</h5>
              
              <!-- 第一行：应支付的token -->
              <div class="payment-row">
                <div class="payment-label">应支付:</div>
                <div class="token-display">
                  <div 
                    v-for="(entry, index) in requiredTokenEntries" 
                    :key="`required-${index}-${entry[0]}`"
                    class="token-item"
                  >
                    <img 
                      :src="`/images/gems/${getGemImageName(entry[0])}.jpg`" 
                      :alt="entry[0]"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ entry[1] }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 第二行：系统建议支付 -->
              <div class="payment-row">
                <div class="payment-label">建议支付:</div>
                <div class="token-display">
                  <div 
                    v-for="(entry, index) in suggestedPaymentEntries" 
                    :key="`suggested-${index}-${entry[0]}`"
                    class="token-item"
                    :class="{ 'clickable': entry[0] !== 'gold' && canConvertToGold(entry[0]) }"
                    :role="entry[0] !== 'gold' && canConvertToGold(entry[0]) ? 'button' : undefined"
                    :tabindex="entry[0] !== 'gold' && canConvertToGold(entry[0]) ? 0 : undefined"
                    :aria-label="entry[0] !== 'gold' && canConvertToGold(entry[0]) ? `将${getGemDisplayName(entry[0])}支付转换为黄金支付` : undefined"
                    @click="convertToGold(entry[0])"
                    @keydown.enter.prevent="convertToGold(entry[0])"
                    @keydown.space.prevent="convertToGold(entry[0])"
                  >
                    <img 
                      :src="`/images/gems/${getGemImageName(entry[0])}.jpg`" 
                      :alt="entry[0]"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ entry[1] }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 第三行：购买后剩余 -->
              <div class="payment-row">
                <div class="payment-label">购买后剩余:</div>
                <div class="token-display">
                  <div 
                    v-for="gemType in ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold']" 
                    :key="gemType"
                    class="token-item"
                  >
                    <img 
                      :src="`/images/gems/${gemType}.jpg`" 
                      :alt="gemType"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ getRemainingTokens(gemType) }}</span>
                  </div>
                </div>
              </div>

              
              
              <div class="payment-note">
                <p>💡 点击建议支付中的非黄金token可以转换为黄金支付</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 选择额外token（复用选择网格，但强制仅1个且颜色匹配，按钮由父组件处理跳过） -->
        <div v-if="actionType === 'takeExtraToken'" class="gem-selection">
          <div class="gem-selection-controls">
            <button 
              v-if="selectedGems.length > 0"
              @click="clearSelectedGems" 
              class="clear-btn"
            >
              清除选择
            </button>
          </div>
          <div class="gem-grid-preview">
            <div v-for="(row, rowIndex) in gemBoard" :key="`extra-row-${rowIndex}`" class="gem-row">
              <div 
                v-for="(gem, colIndex) in row" 
                :key="`extra-col-${colIndex}`"
                class="gem-cell"
                :class="{ 
                  'has-gem': gem, 
                  'selected': isGemSelected(rowIndex, colIndex),
                  'clickable': gem && gem !== 'gold' && gem === (selectedCard?.bonus || selectedCard?.color) && !isGemSelected(rowIndex, colIndex) && selectedGems.length < 1,
                  'disabled': !gem || gem === 'gold' || gem !== (selectedCard?.bonus || selectedCard?.color) || selectedGems.length >= 1
                }"
                role="button"
                :tabindex="gem && gem !== 'gold' && gem === (selectedCard?.bonus || selectedCard?.color) ? 0 : -1"
                :aria-label="gem ? `选择额外${getGemDisplayName(gem)}，第${rowIndex + 1}行第${colIndex + 1}列` : undefined"
                :aria-pressed="gem ? isGemSelected(rowIndex, colIndex) : undefined"
                :aria-disabled="!gem || gem === 'gold' || gem !== (selectedCard?.bonus || selectedCard?.color) || (!isGemSelected(rowIndex, colIndex) && selectedGems.length >= 1)"
                @click="selectGem(rowIndex, colIndex, gem)"
                @keydown.enter.prevent="selectGem(rowIndex, colIndex, gem)"
                @keydown.space.prevent="selectGem(rowIndex, colIndex, gem)"
              >
                <img 
                  v-if="gem" 
                  :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                  :alt="gem"
                  class="gem-image"
                />
                <span v-else class="empty-cell">空</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 窃取消费对话框：展示对手拥有的可被窃取的非黄金token -->
        <div v-if="actionType === 'stealToken'" class="gem-selection">
          <div class="gem-display">
            <div class="gem-row">
              <div 
                v-for="gemType in ['white','blue','green']"
                :key="`steal-${gemType}`"
                class="gem-item"
                :class="{ 'clickable': (opponentGemCount(gemType) > 0) && !isSelectedGemType(gemType), 'disabled': opponentGemCount(gemType) <= 0, 'selected': isSelectedGemType(gemType) }"
                role="button"
                :tabindex="opponentGemCount(gemType) > 0 ? 0 : -1"
                :aria-label="`窃取${getGemDisplayName(gemType)}，对手有${opponentGemCount(gemType)}枚`"
                :aria-pressed="isSelectedGemType(gemType)"
                :aria-disabled="opponentGemCount(gemType) <= 0"
                @click="selectStealGemType(gemType)"
                @keydown.enter.prevent="selectStealGemType(gemType)"
                @keydown.space.prevent="selectStealGemType(gemType)"
              >
                <img :src="`/images/gems/${gemType}.jpg`" :alt="gemType" class="gem-icon" />
                <span class="gem-count">×{{ opponentGemCount(gemType) }}</span>
              </div>
            </div>
            <div class="gem-row">
              <div 
                v-for="gemType in ['red','black','pearl']"
                :key="`steal-${gemType}`"
                class="gem-item"
                :class="{ 'clickable': (opponentGemCount(gemType) > 0) && !isSelectedGemType(gemType), 'disabled': opponentGemCount(gemType) <= 0, 'selected': isSelectedGemType(gemType) }"
                role="button"
                :tabindex="opponentGemCount(gemType) > 0 ? 0 : -1"
                :aria-label="`窃取${getGemDisplayName(gemType)}，对手有${opponentGemCount(gemType)}枚`"
                :aria-pressed="isSelectedGemType(gemType)"
                :aria-disabled="opponentGemCount(gemType) <= 0"
                @click="selectStealGemType(gemType)"
                @keydown.enter.prevent="selectStealGemType(gemType)"
                @keydown.space.prevent="selectStealGemType(gemType)"
              >
                <img :src="`/images/gems/${gemType}.jpg`" :alt="gemType" class="gem-icon" />
                <span class="gem-count">×{{ opponentGemCount(gemType) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 百搭颜色对话框：展示一般颜色，依据玩家是否拥有该颜色bonus决定可选/禁用；数量显示为当前bonus数 -->
        <div v-if="actionType === 'chooseWildcardColor'" class="gem-selection">
          <div class="gem-display">
            <div class="gem-row">
              <div 
                v-for="gemType in ['white','blue','green']"
                :key="`wild-${gemType}`"
                class="gem-item"
                :class="{ 'clickable': (getPlayerBonus(gemType) > 0) && !isSelectedWildcardColor(gemType), 'disabled': getPlayerBonus(gemType) <= 0, 'selected': isSelectedWildcardColor(gemType) }"
                role="button"
                :tabindex="getPlayerBonus(gemType) > 0 ? 0 : -1"
                :aria-label="`选择${getGemDisplayName(gemType)}作为百搭颜色，优惠${getPlayerBonus(gemType)}`"
                :aria-pressed="isSelectedWildcardColor(gemType)"
                :aria-disabled="getPlayerBonus(gemType) <= 0"
                @click="selectWildcardColor(gemType)"
                @keydown.enter.prevent="selectWildcardColor(gemType)"
                @keydown.space.prevent="selectWildcardColor(gemType)"
              >
                <img :src="`/images/gems/${gemType}.jpg`" :alt="gemType" class="gem-icon" />
                <span class="gem-count">×{{ getPlayerBonus(gemType) }}</span>
              </div>
            </div>
            <div class="gem-row">
              <div 
                v-for="gemType in ['red','black']"
                :key="`wild-${gemType}`"
                class="gem-item"
                :class="{ 'clickable': (getPlayerBonus(gemType) > 0) && !isSelectedWildcardColor(gemType), 'disabled': getPlayerBonus(gemType) <= 0, 'selected': isSelectedWildcardColor(gemType) }"
                role="button"
                :tabindex="getPlayerBonus(gemType) > 0 ? 0 : -1"
                :aria-label="`选择${getGemDisplayName(gemType)}作为百搭颜色，优惠${getPlayerBonus(gemType)}`"
                :aria-pressed="isSelectedWildcardColor(gemType)"
                :aria-disabled="getPlayerBonus(gemType) <= 0"
                @click="selectWildcardColor(gemType)"
                @keydown.enter.prevent="selectWildcardColor(gemType)"
                @keydown.space.prevent="selectWildcardColor(gemType)"
              >
                <img :src="`/images/gems/${gemType}.jpg`" :alt="gemType" class="gem-icon" />
                <span class="gem-count">×{{ getPlayerBonus(gemType) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 选择贵族对话框：只展示版图上剩余的贵族 -->
        <div v-if="actionType === 'chooseNoble'" class="gem-selection">
          <div class="gem-display">
            <div class="gem-row">
              <div 
                v-for="nobleId in getAvailableNobles()"
                :key="`noble-${nobleId}`"
                class="gem-item"
                :class="{ 'clickable': selectedNobleId !== nobleId, 'selected': selectedNobleId === nobleId }"
                role="button"
                tabindex="0"
                :aria-label="`选择贵族${nobleId}`"
                :aria-pressed="selectedNobleId === nobleId"
                @click="selectNoble(nobleId)"
                @keydown.enter.prevent="selectNoble(nobleId)"
                @keydown.space.prevent="selectNoble(nobleId)"
              >
                <img :src="`/images/nobles/${nobleId}.jpg`" :alt="nobleId" class="noble-thumb" />
              </div>
            </div>
          </div>
        </div>

        <!-- 丢弃宝石操作 -->
        <div v-if="actionType === 'discardGems'" class="gem-discard">
          <h4>丢弃宝石</h4>
          <p class="discard-message">
            您的宝石总数超过10个，请丢弃一些宝石直到总数为{{ gemDiscardTarget }}。
          </p>
          
          <div class="gem-display">
            <div class="gem-row">
              <div 
                v-for="gemType in ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold']" 
                :key="gemType"
                class="gem-item"
                :class="{ 
                  'clickable': getCurrentGemCount(gemType) > 0,
                  'disabled': getCurrentGemCount(gemType) <= 0
                }"
                role="button"
                :tabindex="getCurrentGemCount(gemType) > 0 ? 0 : -1"
                :aria-label="`丢弃一枚${getGemDisplayName(gemType)}，当前${getCurrentGemCount(gemType)}枚`"
                :aria-disabled="getCurrentGemCount(gemType) <= 0"
                @click="discardGem(gemType)"
                @keydown.enter.prevent="discardGem(gemType)"
                @keydown.space.prevent="discardGem(gemType)"
              >
                <img 
                  :src="`/images/gems/${gemType}.jpg`" 
                  :alt="gemType"
                  class="gem-icon"
                  @error="handleGemImageError"
                />
                <span class="gem-count">{{ getCurrentGemCount(gemType) }}</span>
                <div v-if="getCurrentGemCount(gemType) > 0" class="discard-hint">点击丢弃</div>
              </div>
            </div>
          </div>
          
          <div class="gem-summary">
            <p>当前总数: <span class="total-count">{{ getCurrentTotalAfterDiscard }}</span></p>
            <p>目标总数: <span class="target-count">{{ gemDiscardTarget }}</span></p>
            <p v-if="Object.keys(discardedGems).length > 0" class="discarded-info">
              已选择丢弃: 
              <span v-for="(count, gemType) in discardedGems" :key="gemType" class="discarded-gem">
                {{ getGemDisplayName(gemType) }}: {{ count }}
              </span>
            </p>
            <p class="discard-tip">
              💡 提示：如果关闭了对话框，系统会自动重新打开，直到您完成宝石丢弃
            </p>
          </div>
        </div>
        
        <!-- 保留发展卡操作 -->
        <div v-if="actionType === 'reserveCard'" class="reserve-selection">
          <h4>选择要保留的发展卡</h4>
          
          <!-- 按等级显示卡牌和牌堆 -->
          <div class="cards-by-level">
            <div 
              v-for="level in [3, 2, 1]" 
              :key="level" 
              class="level-section"
            >
              <h5>等级 {{ level }}</h5>
              <div class="level-content">
                <!-- 牌堆（左侧） -->
                <div class="deck-section">
                  <div class="deck-cards-grid">
                    <div 
                      v-if="getUnflippedCount(level) > 0"
                      class="deck-card-item"
                      :class="{ 'selected': selectedCard && selectedCard.type === 'deck' && selectedCard.level === level }"
                      role="button"
                      tabindex="0"
                      :aria-label="`保留等级${level}牌堆顶牌`"
                      :aria-pressed="selectedCard && selectedCard.type === 'deck' && selectedCard.level === level"
                      @click="selectDeckCard(level)"
                      @keydown.enter.prevent="selectDeckCard(level)"
                      @keydown.space.prevent="selectDeckCard(level)"
                    >
                      <img 
                        :src="`/images/cards/back${level}.jpg`" 
                        :alt="`等级${level}牌背`"
                        class="card-image"
                        @error="handleCardImageError"
                      />
                      <div class="deck-card-label">牌堆</div>
                    </div>
                  </div>
                </div>
                
                <!-- 已翻开的卡牌（右侧） -->
                <div class="field-cards-section">
                  <div class="cards-grid">
                    <div 
                      v-for="card in getCardsByLevel(level)" 
                      :key="card.id"
                      class="card-item"
                      :class="{ 'selected': selectedCard && selectedCard.id === card.id }"
                      role="button"
                      tabindex="0"
                      :aria-label="`保留发展卡：${card.name}`"
                      :aria-pressed="selectedCard && selectedCard.id === card.id"
                      @click="selectCard(card)"
                      @keydown.enter.prevent="selectCard(card)"
                      @keydown.space.prevent="selectCard(card)"
                    >
                      <img 
                        :src="`/images/cards/${card.id}.jpg`" 
                        :alt="card.name"
                        class="card-image"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="selected-card" v-if="selectedCard">
            <img 
              v-if="selectedCard.type === 'deck'"
              :src="`/images/cards/back${selectedCard.level}.jpg`" 
              :alt="`等级${selectedCard.level}牌背`"
              class="card-preview"
            />
            <img 
              v-else
              :src="`/images/cards/${selectedCard.id}.jpg`" 
              :alt="selectedCard.name" 
              class="card-preview" 
            />
            <div class="card-info">
              <div class="card-name">
                {{ selectedCard.type === 'deck' ? `等级${selectedCard.level}牌堆` : selectedCard.name }}
              </div>
              <div v-if="selectedCard.type !== 'deck'" class="card-cost">
                费用: {{ formatCardCost(selectedCard.cost) }}
              </div>
              <div v-if="selectedCard.type === 'deck'" class="card-note">
                从牌堆随机抽取一张等级{{ selectedCard.level }}的卡牌
              </div>
            </div>
          </div>
        </div>
        
        <!-- 花费特权操作 -->
        <div v-if="actionType === 'spendPrivilege'" class="privilege-selection">
          <h4>选择要花费的特权指示物数量</h4>
          <div class="privilege-count">
            <button 
              v-for="count in [1, 2, 3]" 
              :key="count"
              :class="{ 'selected': privilegeCount === count, 'disabled': count > availablePrivileges }"
              @click="selectPrivilegeCount(count)"
              :disabled="count > availablePrivileges"
            >
              {{ count }}
            </button>
          </div>
          <div v-if="privilegeCount > 0" class="gem-selection">
            <h5>选择要拿取的宝石 ({{ privilegeCount }}个)</h5>
            <div class="selected-gems">
              <div v-for="(gem, index) in selectedGems" :key="index" class="selected-gem">
                <span>{{ gem.type }} ({{ gem.x }}, {{ gem.y }})</span>
                <button type="button" @click="removeGem(index)" class="remove-btn" :aria-label="`移除已选${getGemDisplayName(gem.type)}`">×</button>
              </div>
            </div>
            <div class="gem-grid-preview">
              <div v-for="(row, rowIndex) in gemBoard" :key="rowIndex" class="gem-row">
                <div 
                  v-for="(gem, colIndex) in row" 
                  :key="colIndex"
                  class="gem-cell"
                  :class="{ 
                    'has-gem': gem, 
                    'selected': isGemSelected(rowIndex, colIndex),
                    'clickable': gem && gem !== 'gold' && !isGemSelected(rowIndex, colIndex) && selectedGems.length < privilegeCount
                  }"
                  role="button"
                  :tabindex="gem && gem !== 'gold' ? 0 : -1"
                  :aria-label="gem ? `选择${getGemDisplayName(gem)}，第${rowIndex + 1}行第${colIndex + 1}列` : undefined"
                  :aria-pressed="gem && gem !== 'gold' ? isGemSelected(rowIndex, colIndex) : undefined"
                  :aria-disabled="gem && gem !== 'gold' ? (!isGemSelected(rowIndex, colIndex) && selectedGems.length >= privilegeCount) : true"
                  @click="selectGem(rowIndex, colIndex, gem)"
                  @keydown.enter.prevent="selectGem(rowIndex, colIndex, gem)"
                  @keydown.space.prevent="selectGem(rowIndex, colIndex, gem)"
                >
                  <img 
                    v-if="gem" 
                    :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                    :alt="gem"
                    class="gem-image"
                  />
                  <span v-else class="empty-cell">空</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dialog-footer">
        <!-- 对于宝石丢弃操作，不显示取消按钮，显示重置按钮 -->
        <button 
          v-if="actionType === 'discardGems'"
          class="btn btn-warning" 
          @click="handleReset"
        >
          重置
        </button>
        <button 
          v-else
          class="btn btn-secondary" 
          @click="handleCancel"
        >
          取消
        </button>

        <!-- takeExtraToken 的跳过按钮：右下角 -->
        <button 
          v-if="actionType === 'takeExtraToken'"
          class="btn btn-light"
          type="button"
          @click="$emit('confirm', { actionType: 'takeExtraToken', selectedGems: [], selectedCard, paymentPlan })"
        >
          跳过
        </button>

        <!-- stealToken 的跳过按钮：无可窃取时允许跳过 -->
        <button 
          v-if="actionType === 'stealToken'"
          class="btn btn-light"
          type="button"
          @click="$emit('confirm', { actionType: 'stealToken', stealGemType: null, selectedCard, paymentPlan })"
        >
          跳过
        </button>

        

        <button 
          class="btn btn-primary" 
          @click="actionType === 'takeExtraToken' ? $emit('confirm', { actionType: 'takeExtraToken', selectedGems, selectedCard, paymentPlan }) : (actionType === 'stealToken' ? $emit('confirm', { actionType: 'stealToken', stealGemType: selectedStealGemType, selectedCard, paymentPlan }) : (actionType === 'chooseWildcardColor' ? $emit('confirm', { actionType: 'chooseWildcardColor', wildcardColor: selectedWildcardColor, selectedCard, paymentPlan }) : (actionType === 'chooseNoble' ? $emit('confirm', { actionType: 'chooseNoble', nobleId: selectedNobleId, selectedCard, paymentPlan }) : handleConfirm())))"
          :disabled="actionType === 'takeExtraToken' ? selectedGems.length !== 1 : (actionType === 'stealToken' ? !selectedStealGemType : (actionType === 'chooseWildcardColor' ? !selectedWildcardColor : (actionType === 'chooseNoble' ? !selectedNobleId : !canConfirm)))"
        >
          {{ actionType === 'discardGems' ? '完成丢弃' : '确认' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { replaceBrokenImageWithLabel } from '../image-fallback'

const props = defineProps({
  visible: Boolean,
  actionType: String,
  title: String,
  message: String,
  gemBoard: Array,
  availablePrivileges: Number,
  flippedCards: Object,
  unflippedCards: Object,
  selectedGoldPosition: Object,
  initialGemPosition: Object,
  playerData: Object,
  selectedCard: Object,
  cardDetails: Object, // 新增：用于传递卡牌详细信息
  gemDiscardTarget: Number // 新增：宝石丢弃目标数量
})

const emit = defineEmits(['confirm', 'cancel', 'discardGem', 'discardGemsBatch', 'reset'])
const dialogRef = ref(null)
let previouslyFocusedElement = null

const getFocusableElements = () => Array.from(dialogRef.value?.querySelectorAll(
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
) || []).filter(element => !element.hasAttribute('hidden'))

const handleDialogKeydown = (event) => {
  if (event.key === 'Escape' && props.actionType !== 'discardGems') {
    event.preventDefault()
    handleCancel()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    dialogRef.value?.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const selectedGems = ref([])
const selectedCard = ref(null)
const selectedGold = ref(null)
const privilegeCount = ref(0)
const paymentPlan = ref({})
// 额外token相关本地状态
const extraSelectedGem = ref(null) // {x, y, type} 或 null
const skipExtraToken = ref(false)
// 窃取消费本地状态
const selectedStealGemType = ref(null) // 'white'|'blue'|'green'|'red'|'black'|'pearl'
// 百搭颜色本地状态
const selectedWildcardColor = ref(null)
// 贵族选择
const selectedNobleId = ref(null)

// 宝石丢弃的本地状态管理
const discardedGems = ref({}) // 记录每种宝石已丢弃的数量
const originalGemCounts = ref({}) // 记录原始宝石数量

// 重置状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    previouslyFocusedElement = document.activeElement
    nextTick(() => dialogRef.value?.focus())
    selectedGems.value = []
    privilegeCount.value = 0
    paymentPlan.value = {} // 重置支付计划
    
    // 重置宝石丢弃状态
    discardedGems.value = {}
    originalGemCounts.value = {}
    
    // 对于保留发展卡操作，不清空selectedGold，因为它是从父组件传递的
    if (props.actionType !== 'reserveCard') {
      selectedGold.value = null
    }
    
    // 对于购买发展卡操作，设置selectedCard并初始化支付计划
    if (props.actionType === 'buyCard') {
      // 从父组件传递的selectedCard中获取卡牌信息
      if (props.selectedCard) {
        selectedCard.value = props.selectedCard
      }
      if (props.playerData) {
        initializePaymentPlan()
      }
      // 重置额外token选择
      extraSelectedGem.value = null
      skipExtraToken.value = false
    } else {
      selectedCard.value = null
    }
    // 重置窃取选择
    selectedStealGemType.value = null
    // 重置百搭颜色选择
    selectedWildcardColor.value = null
    // 重置贵族选择
    selectedNobleId.value = null
    
    // 对于拿取宝石操作，自动选中初始宝石
    if (props.actionType === 'takeGems' && props.initialGemPosition) {
      const { x, y, type } = props.initialGemPosition
      selectedGems.value = [{ x, y, type }]
    }
    
    // 对于宝石丢弃操作，记录原始宝石数量
    if (props.actionType === 'discardGems' && props.playerData?.gems) {
      originalGemCounts.value = { ...props.playerData.gems }
      console.log('记录原始宝石数量:', originalGemCounts.value)
    }
  } else if (previouslyFocusedElement instanceof HTMLElement) {
    nextTick(() => previouslyFocusedElement?.focus())
    previouslyFocusedElement = null
  }
})

// 监听黄金位置变化
watch(() => props.selectedGoldPosition, (newVal) => {
  if (newVal && props.actionType === 'reserveCard') {
    selectedGold.value = { ...newVal }
  }
}, { immediate: true })

// Recompute from the latest resources, including delayed privilege results.
// Compare values rather than object identity so identical server snapshots do
// not overwrite a player's deliberate gold substitution.
watch(() => JSON.stringify([
  selectedCard.value?.id,
  Object.entries(selectedCard.value?.cost || {}).sort(([a], [b]) => a.localeCompare(b)),
  props.playerData?.id,
  ...['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold'].map(type => [
    props.playerData?.gems?.[type] || 0,
    props.playerData?.bonus?.[type] || 0,
  ]),
]), () => {
  if (props.visible && selectedCard.value && props.actionType === 'buyCard') {
    initializePaymentPlan()
  }
})

// 调试：监听 paymentPlan 变化
watch(() => paymentPlan.value, (newVal) => {
  console.log('paymentPlan 变化:', newVal)
}, { deep: true })

// 计算当前宝石总数
const currentTotalGems = computed(() => {
  if (!props.playerData?.gems) return 0
  let total = 0
  for (const gemType in props.playerData.gems) {
    if (gemType !== '') {
      total += props.playerData.gems[gemType] || 0
    }
  }
  return total
})

// 计算丢弃后的宝石总数
const getCurrentTotalAfterDiscard = computed(() => {
  if (!props.playerData?.gems) return 0
  let total = 0
  for (const gemType in props.playerData.gems) {
    if (gemType !== '') {
      const originalCount = props.playerData.gems[gemType] || 0
      const discardedCount = discardedGems.value[gemType] || 0
      total += Math.max(0, originalCount - discardedCount)
    }
  }
  return total
})

// 获取当前可丢弃的宝石数量
const getCurrentGemCount = (gemType) => {
  if (!props.playerData?.gems) return 0
  const originalCount = props.playerData.gems[gemType] || 0
  const discardedCount = discardedGems.value[gemType] || 0
  return Math.max(0, originalCount - discardedCount)
}

// 获取宝石显示名称
const getGemDisplayName = (gemType) => {
  const gemMap = {
    'white': '白色',
    'blue': '蓝色',
    'green': '绿色',
    'red': '红色',
    'black': '黑色',
    'pearl': '珍珠',
    'gold': '黄金',
    'gray': '无色'
  }
  return gemMap[gemType] || gemType
}

// 获取宝石图片名称
const getGemImageName = (gemType) => {
  const gemMap = {
    'white': 'white',
    'blue': 'blue',
    'green': 'green',
    'red': 'red',
    'black': 'black',
    'pearl': 'pearl',
    'gold': 'gold'
  }
  return gemMap[gemType] || gemType
}

// 格式化卡牌费用
const formatCardCost = (cost) => {
  if (!cost || Object.keys(cost).length === 0) return '无'
  return Object.entries(cost).map(([gem, count]) => `${gem}:${count}`).join(', ')
}

// 根据等级获取发展卡
const getCardsByLevel = (level) => {
  if (!props.flippedCards) return []
  const cardIds = props.flippedCards[level] || []
  
  // 从父组件传递的卡牌详细信息中获取数据
  // 注意：这里需要从父组件传递cardDetails prop
  const cardDetails = props.cardDetails || {}
  
  return cardIds.map(id => {
    const cardDetail = cardDetails[id]
    if (!cardDetail) {
      console.warn(`未找到卡牌 ${id} 的详细信息`)
      return null
    }
    
    return {
      id: cardDetail.id,
      name: `卡牌${cardDetail.id}`,
      level: cardDetail.level,
      cost: cardDetail.cost,
      bonus: cardDetail.bonus
    }
  }).filter(card => card !== null)
}

// 选择宝石
const selectGem = (x, y, gemType) => {
  console.log('选择宝石:', { x, y, gemType, actionType: props.actionType })
  
  // 禁止选择空位置（无宝石）
  if (!gemType) {
    console.log('该位置没有宝石，忽略点击')
    return
  }

  // 禁止选择黄金：拿取宝石与花费特权均不可选
  if ((props.actionType === 'takeGems' || props.actionType === 'spendPrivilege') && gemType === 'gold') {
    console.log('拿取宝石操作中不能选择黄金')
    return
  }
  // 额外token：只能选择与卡牌颜色一致且非黄金，且最多1枚
  if (props.actionType === 'takeExtraToken') {
    const cardColor = props.selectedCard?.bonus || props.selectedCard?.color
    if (!gemType || gemType === 'gold' || gemType !== cardColor) {
      console.log('额外token操作中只能选择与卡牌颜色一致且非黄金的宝石')
      return
    }
    if (selectedGems.value.length >= 1) {
      console.log('额外token已选择1枚，不能再选择')
      return
    }
  }
  
  if (props.actionType === 'takeGems' && selectedGems.value.length >= 3) {
    console.log('已达到最大选择数量')
    return
  }
  if (props.actionType === 'spendPrivilege' && selectedGems.value.length >= privilegeCount.value) {
    console.log('已达到特权数量限制')
    return
  }
  // 额外token数量上限
  if (props.actionType === 'takeExtraToken' && selectedGems.value.length >= 1) {
    console.log('额外token已选择1枚，不能再选择')
    return
  }
  
  // 检查是否已经选择过这个位置
  if (isGemSelected(x, y)) {
    console.log('该位置已被选择')
    return
  }
  
  // 检查是否已经在同一直线上
  if (props.actionType === 'takeGems' && selectedGems.value.length > 0) {
    if (!isInLine(x, y)) {
      console.log('宝石不在同一直线上')
      return
    }
  }
  
  selectedGems.value.push({ x, y, type: gemType })
  console.log('宝石选择成功，当前选择:', selectedGems.value)
}
// 窃取消费：对手宝石计数
const opponentGemCount = (gemType) => {
  // 对手数据从 playerData 推断：当前 playerData 是自己，需从父级传入对手数据，这里简化：
  // 直接从 props.playerData.opponentGems 或 props.playerData?.opponent?.gems 读取（若存在）
  const opp = props.playerData?.opponent || {}
  const alt = props.playerData?.opponentGems || {}
  const pool = opp.gems || alt
  return (pool && pool[gemType]) || 0
}

const isSelectedGemType = (gemType) => selectedStealGemType.value === gemType
const selectStealGemType = (gemType) => {
  if (gemType === 'gold') return
  if (opponentGemCount(gemType) <= 0) return
  selectedStealGemType.value = gemType
}

// 百搭颜色：读取玩家bonus
const getPlayerBonus = (gemType) => {
  return (props.playerData?.bonus && props.playerData.bonus[gemType]) || 0
}
const isSelectedWildcardColor = (gemType) => selectedWildcardColor.value === gemType
const selectWildcardColor = (gemType) => {
  if (getPlayerBonus(gemType) <= 0) return
  selectedWildcardColor.value = gemType
}

// 贵族选择：获取版图上剩余的贵族
const getAvailableNobles = () => {
  return props.playerData?.availableNobles || []
}
const selectNoble = (nobleId) => {
  selectedNobleId.value = nobleId
}

// 移除宝石
const removeGem = (index) => {
  selectedGems.value.splice(index, 1)
}

// 清除已选择的宝石
const clearSelectedGems = () => {
  selectedGems.value = []
}

// 选择黄金
const selectGold = (x, y) => {
  selectedGold.value = { x, y }
}

// 选择卡牌
const selectCard = (card) => {
  selectedCard.value = card
}

// 选择特权数量
const selectPrivilegeCount = (count) => {
  privilegeCount.value = count
  selectedGems.value = [] // 清空已选择的宝石
}

// 检查宝石是否在同一直线上
const isInLine = (x, y) => {
  if (selectedGems.value.length === 0) return true
  
  const gems = [...selectedGems.value, { x, y }]
  if (gems.length < 2) return true
  
  // 检查是否在水平线
  const sameRow = gems.every(gem => gem.x === gems[0].x)
  if (sameRow) {
    const sorted = gems.sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y !== sorted[i-1].y + 1) return false
    }
    return true
  }
  
  // 检查是否在垂直线
  const sameCol = gems.every(gem => gem.y === gems[0].y)
  if (sameCol) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  // 检查是否在对角线（从左上到右下）
  const sameDiagonal1 = gems.every(gem => gem.x - gem.y === gems[0].x - gems[0].y)
  if (sameDiagonal1) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  // 检查是否在对角线（从右上到左下）
  const sameDiagonal2 = gems.every(gem => gem.x + gem.y === gems[0].x + gems[0].y)
  if (sameDiagonal2) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  return false
}

// 检查宝石是否已选择
const isGemSelected = (x, y) => {
  return selectedGems.value.some(gem => gem.x === x && gem.y === y)
}

// 是否可以确认
const canConfirm = computed(() => {
  switch (props.actionType) {
    case 'takeGems':
      return selectedGems.value.length >= 1 && selectedGems.value.length <= 3
    case 'buyCard':
      if (!selectedCard.value) {
        console.log('canConfirm buyCard: 没有选择卡牌')
        return false
      }
      
      // 检查支付计划是否完整
      let totalPaid = 0
      let totalRequired = 0
      
      // 计算总费用（考虑奖励优惠）
      for (const gemType in selectedCard.value.cost) {
        const required = selectedCard.value.cost[gemType]
        const bonus = props.playerData?.bonus?.[gemType] || 0
        const actualRequired = Math.max(0, required - bonus)
        totalRequired += actualRequired
      }
      
      // 计算已支付（包括宝石和黄金）
      for (const gemType in paymentPlan.value) {
        totalPaid += paymentPlan.value[gemType] || 0
      }
      
      // 额外token效果下，需满足：未包含该效果或（已选1个或选择跳过）
      const canConfirm = totalPaid >= totalRequired
      console.log('canConfirm buyCard:', { totalPaid, totalRequired, canConfirm })
      return canConfirm
    case 'takeExtraToken':
      // 允许0或1个；确认即提交，取消即跳过
      return selectedGems.value.length <= 1
    case 'stealToken':
      // 仅在选择了一个可窃取的宝石类型后才能确认
      return !!selectedStealGemType.value
    case 'chooseWildcardColor':
      // 仅在选择了一个允许的颜色后才能确认
      return !!selectedWildcardColor.value
    case 'chooseNoble':
      return !!selectedNobleId.value
    case 'reserveCard':
      // 对于保留发展卡，只需要选择卡牌即可，黄金位置已经通过点击确定
      return selectedCard.value !== null
    case 'spendPrivilege':
      return privilegeCount.value > 0 && selectedGems.value.length === privilegeCount.value
    case 'discardGems':
      // 只有当宝石总数达到目标数量时才能确认
      const canConfirmDiscard = getCurrentTotalAfterDiscard.value === (props.gemDiscardTarget || 10)
      console.log('宝石丢弃确认检查:', {
        currentTotal: getCurrentTotalAfterDiscard.value,
        target: props.gemDiscardTarget || 10,
        canConfirm: canConfirmDiscard
      })
      return canConfirmDiscard
    default:
      return true
  }
})
// 计算：该卡是否包含额外token效果
const hasExtraTokenEffect = computed(() => {
  const effects = props.selectedCard?.effects || []
  return effects.includes('extra_token')
})

// 额外token选择逻辑
const isExtraGemSelected = (x, y) => {
  return !!extraSelectedGem.value && extraSelectedGem.value.x === x && extraSelectedGem.value.y === y
}

const selectExtraGem = (x, y, gemType) => {
  // 仅允许与卡牌颜色一致，且不是黄金
  const cardColor = props.selectedCard?.bonus || props.selectedCard?.color
  if (!gemType || gemType === 'gold' || gemType !== cardColor) return
  extraSelectedGem.value = { x, y, type: gemType }
  skipExtraToken.value = false
}

// 处理确认
const handleConfirm = () => {
  console.log('ActionDialog: 确认操作，当前状态:', {
    actionType: props.actionType,
    selectedGems: selectedGems.value,
    selectedCard: selectedCard.value,
    selectedGold: selectedGold.value,
    privilegeCount: privilegeCount.value,
    paymentPlan: paymentPlan.value
  })
  
  // 对于宝石丢弃操作，发送批量丢弃操作到后端
  if (props.actionType === 'discardGems') {
    console.log('确认宝石丢弃，发送批量丢弃操作:', discardedGems.value)
    
    // 检查是否达到目标数量
    if (getCurrentTotalAfterDiscard.value > (props.gemDiscardTarget || 10)) {
      console.log('宝石总数仍然超过目标，无法确认')
      return
    }
    
    // 发送批量丢弃操作到父组件
    emit('discardGemsBatch', { gemDiscards: discardedGems.value })
    
    // 通知父组件宝石丢弃已完成
    emit('confirm', { actionType: 'discardGems', completed: true })
    return
  }
  
  const data = {
    actionType: props.actionType,
    selectedGems: selectedGems.value,
    selectedCard: selectedCard.value,
    selectedGold: selectedGold.value,
    privilegeCount: privilegeCount.value,
    paymentPlan: paymentPlan.value,
    stealGemType: selectedStealGemType.value
  }
  
  console.log('ActionDialog: 发送确认事件:', data)
  emit('confirm', data)
}

// 处理取消
const handleCancel = () => {
  // 对于宝石丢弃操作，通知父组件对话框被关闭
  if (props.actionType === 'discardGems') {
    emit('cancel', { actionType: 'discardGems', closed: true })
  } else {
    emit('cancel')
  }
}

// 处理重置（仅用于宝石丢弃）
const handleReset = () => {
  console.log('重置宝石丢弃选择')
  // 清空本地丢弃状态
  discardedGems.value = {}
  originalGemCounts.value = {}
  console.log('已重置丢弃状态')
}

// 处理遮罩点击
const handleOverlayClick = () => {
  // 允许所有操作类型都可以通过点击遮罩关闭
  handleCancel()
}

// 处理卡牌图片加载失败
const handleCardImageError = (event) => {
  replaceBrokenImageWithLabel(event.target, event.target.alt || '发展卡', 'card-image-fallback')
};

// 处理宝石图片加载失败
const handleGemImageError = (event) => {
  replaceBrokenImageWithLabel(event.target, event.target.alt || '宝石', 'gem-image-fallback')
};

// 获取未翻开的卡牌数量（从后端数据中获取）
const getUnflippedCount = (level) => {
  if (!props.unflippedCards) return 0;
  // 直接从后端获取该等级未翻开的卡牌数量
  return props.unflippedCards[level] || 0;
};

// 选择牌堆卡牌
const selectDeckCard = (level) => {
  if (getUnflippedCount(level) === 0) {
    console.log('该等级牌堆已无未翻开的卡牌');
    return;
  }
  selectedCard.value = { type: 'deck', level: level };
};



// 丢弃宝石（本地状态管理）
const discardGem = (gemType) => {
  const currentCount = getCurrentGemCount(gemType)
  if (currentCount <= 0) {
    console.log('没有该类型的宝石可以丢弃:', gemType)
    return
  }
  
  console.log('选择丢弃宝石:', gemType)
  
  // 更新本地丢弃状态
  if (!discardedGems.value[gemType]) {
    discardedGems.value[gemType] = 0
  }
  discardedGems.value[gemType]++
  
  // 记录原始宝石数量（如果还没有记录）
  if (Object.keys(originalGemCounts.value).length === 0) {
    originalGemCounts.value = { ...props.playerData.gems }
  }
  
  console.log('当前丢弃状态:', discardedGems.value)
}

// 获取卡牌总费用（从后端卡牌数据中获取）
const getTotalCost = () => {
  if (!selectedCard.value?.cost) return 0;
  let total = 0;
  // 从后端卡牌数据中计算总费用
  for (const gemType in selectedCard.value.cost) {
    total += selectedCard.value.cost[gemType];
  }
  return total;
};

// 获取总支付金额
const getTotalPaid = () => {
  let total = 0
  // 从用户输入的支付计划中计算总支付金额
  for (const gemType in paymentPlan.value) {
    total += paymentPlan.value[gemType] || 0
  }
  return total
}

// 获取所需支付数量（从后端卡牌数据中获取）
const getRequiredCost = (gemType) => {
  if (!selectedCard.value?.cost) {
    console.log('getRequiredCost: 没有卡牌费用信息')
    return 0
  }
  // 从后端卡牌数据中获取该宝石类型的费用
  const cost = selectedCard.value.cost[gemType] || 0
  return cost
}

// 获取可用宝石数量（从后端玩家数据中获取）
const getAvailableTokens = (gemType) => {
  if (!props.playerData?.gems) {
    console.log('getAvailableTokens: 没有玩家宝石数据')
    return 0
  }
  // 从后端玩家数据中获取该宝石类型的可用数量
  const count = props.playerData.gems[gemType] || 0
  return count
}

// 获取宝石最大支付数量
const getMaxPayment = (gemType) => {
  if (!selectedCard.value?.cost) return 0;
  const required = selectedCard.value.cost[gemType] || 0;
  const available = getAvailableTokens(gemType);
  return Math.min(required, available);
};

// 获取黄金所需支付数量
const getGoldRequired = () => {
  if (!selectedCard.value?.cost) {
    console.log('getGoldRequired: 没有卡牌费用信息')
    return 0
  }
  
  let totalRequired = 0
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData?.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    if (actualRequired > available) {
      totalRequired += (actualRequired - available)
    }
  }
  
  console.log('getGoldRequired:', totalRequired)
  return totalRequired
}

// 获取应支付的token数量
const getRequiredTokens = () => {
  try {
    console.log('getRequiredTokens 被调用:', { 
      selectedCard: selectedCard.value, 
      hasCost: !!selectedCard.value?.cost,
      cost: selectedCard.value?.cost 
    })
    
    if (!selectedCard.value?.cost || typeof selectedCard.value.cost !== 'object') {
      console.log('getRequiredTokens: 没有卡牌费用信息或费用不是对象')
      return {}
    }
    
    const required = {}
    for (const gemType in selectedCard.value.cost) {
      if (gemType && typeof gemType === 'string') {
        const cost = selectedCard.value.cost[gemType]
        if (typeof cost === 'number' && cost > 0) {
          const bonus = props.playerData?.bonus?.[gemType] || 0
          const actualRequired = Math.max(0, cost - bonus)
          if (actualRequired > 0) {
            required[gemType] = actualRequired
          }
        }
      }
    }
    
    console.log('getRequiredTokens:', required)
    return required
  } catch (error) {
    console.error('getRequiredTokens 发生错误:', error)
    return {}
  }
}

// 获取系统建议支付的token数量
const getSuggestedPayment = () => {
  try {
    if (!selectedCard.value?.cost || !props.playerData) {
      console.log('getSuggestedPayment: 缺少必要数据')
      return {}
    }
    
    const suggested = {}
    
    // 显示当前支付计划
    for (const gemType in paymentPlan.value) {
      if (gemType && typeof gemType === 'string') {
        const amount = paymentPlan.value[gemType]
        if (typeof amount === 'number' && amount > 0) {
          if (gemType === 'gold') {
            suggested.gold = amount
          } else {
            suggested[gemType] = amount
          }
        }
      }
    }
    
    console.log('getSuggestedPayment:', suggested)
    return suggested
  } catch (error) {
    console.error('getSuggestedPayment 发生错误:', error)
    return {}
  }
}

// 更新支付计划
const updatePaymentPlan = () => {
  // 确保支付计划合理
  for (const gemType in paymentPlan.value) {
    if (gemType === 'gold') {
      paymentPlan.value[gemType] = Math.max(0, Math.min(paymentPlan.value[gemType] || 0, getAvailableTokens(gemType)));
    } else {
      paymentPlan.value[gemType] = Math.max(0, Math.min(paymentPlan.value[gemType] || 0, getMaxPayment(gemType)));
    }
  }
};

// 初始化支付计划
const initializePaymentPlan = () => {
  console.log('initializePaymentPlan 被调用:', { 
    selectedCard: selectedCard.value, 
    playerData: props.playerData,
    hasCost: !!selectedCard.value?.cost,
    hasPlayerData: !!props.playerData
  })
  
  if (!selectedCard.value?.cost || !props.playerData) {
    console.log('初始化支付计划失败:', { selectedCard: selectedCard.value, playerData: props.playerData })
    return
  }
  
  console.log('开始初始化支付计划:', { selectedCard: selectedCard.value, playerData: props.playerData })
  
  paymentPlan.value = {}
  
  // 为每种宝石类型设置初始支付数量
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    
    // 初始时尽量使用对应颜色的宝石支付
    paymentPlan.value[gemType] = Math.min(actualRequired, available)
  }
  
  // 计算需要多少黄金来补足短缺
  let totalGoldNeeded = 0
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData?.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    
    if (actualRequired > available) {
      totalGoldNeeded += (actualRequired - available)
    }
  }
  
  paymentPlan.value.gold = totalGoldNeeded
  
  console.log('支付计划初始化完成:', paymentPlan.value)
}

// 安全地获取应支付token的entries（防止undefined值）
const getRequiredTokensEntries = () => {
  try {
    const tokens = getRequiredTokens()
    if (!tokens || typeof tokens !== 'object') {
      console.warn('getRequiredTokensEntries: tokens不是有效对象', tokens)
      return []
    }
    
    const entries = Object.entries(tokens)
    if (!Array.isArray(entries)) {
      console.warn('getRequiredTokensEntries: Object.entries返回的不是数组', entries)
      return []
    }
    
    // 过滤掉任何包含undefined或null的条目
    const safeEntries = entries.filter(entry => 
      entry && 
      Array.isArray(entry) &&
      entry.length === 2 && 
      entry[0] !== undefined && 
      entry[0] !== null && 
      entry[1] !== undefined && 
      entry[1] !== null &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number'
    )
    
    console.log('getRequiredTokensEntries:', { original: tokens, safe: safeEntries })
    return safeEntries
  } catch (error) {
    console.error('getRequiredTokensEntries 发生错误:', error)
    return []
  }
}

// 预过滤的应支付token entries（计算属性）
const requiredTokenEntries = computed(() => {
  const arr = getRequiredTokensEntries()
  return Array.isArray(arr)
    ? arr.filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && v > 0)
    : []
})

// 安全地获取建议支付token的entries（防止undefined值）
const getSuggestedPaymentEntries = () => {
  try {
    const tokens = getSuggestedPayment()
    if (!tokens || typeof tokens !== 'object') {
      console.warn('getSuggestedPaymentEntries: tokens不是有效对象', tokens)
      return []
    }
    
    const entries = Object.entries(tokens)
    if (!Array.isArray(entries)) {
      console.warn('getSuggestedPaymentEntries: Object.entries返回的不是数组', entries)
      return []
    }
    
    // 过滤掉任何包含undefined或null的条目
    const safeEntries = entries.filter(entry => 
      entry && 
      Array.isArray(entry) &&
      entry.length === 2 && 
      entry[0] !== undefined && 
      entry[0] !== null && 
      entry[1] !== undefined && 
      entry[1] !== null &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number'
    )
    
    console.log('getSuggestedPaymentEntries:', { original: tokens, safe: safeEntries })
    return safeEntries
  } catch (edit) {
    console.error('getSuggestedPaymentEntries 发生错误:', edit)
    return []
  }
}

// 预过滤的建议支付token entries（计算属性）
const suggestedPaymentEntries = computed(() => {
  const arr = getSuggestedPaymentEntries()
  return Array.isArray(arr)
    ? arr.filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && v > 0)
    : []
})

// 是否可以转换为黄金支付
const canConvertToGold = (gemType) => {
  if (!props.playerData?.gems?.gold) {
    console.log('canConvertToGold: 没有黄金')
    return false
  }
  
  const required = getRequiredCost(gemType)
  const available = getAvailableTokens(gemType)
  const bonus = props.playerData?.bonus?.[gemType] || 0
  const actualRequired = Math.max(0, required - bonus)
  
  // 当前支付数量
  const currentPaid = paymentPlan.value[gemType] || 0
  // 可用黄金数量
  const availableGold = props.playerData.gems.gold - (paymentPlan.value.gold || 0)
  
  // 可以转换的条件：
  // 1. 当前支付数量 > 0（有宝石可以转换）
  // 2. 有足够的黄金来替代（每次转换1个）
  const canConvert = currentPaid > 0 && availableGold >= 1
  
  console.log(`canConvertToGold(${gemType}):`, { 
    required, available, bonus, actualRequired, 
    currentPaid, availableGold, canConvert 
  })
  
  return canConvert
}

// 将非黄金token转换为黄金支付
const convertToGold = (gemType) => {
  if (!canConvertToGold(gemType)) {
    console.log(`convertToGold(${gemType}): 无法转换`)
    return
  }
  
  const currentPaid = paymentPlan.value[gemType] || 0
  
  // 每次只转换1个宝石，而不是全部
  if (currentPaid > 0) {
    paymentPlan.value[gemType] = currentPaid - 1
    paymentPlan.value.gold = (paymentPlan.value.gold || 0) + 1
    
    console.log('转换支付:', { 
      gemType, 
      currentPaid, 
      newPaid: paymentPlan.value[gemType],
      newGold: paymentPlan.value.gold,
      message: `已将1个${getGemDisplayName(gemType)}转换为1个黄金支付`
    })
  }
}

// 获取购买后剩余的token数量
const getRemainingTokens = (gemType) => {
  const available = getAvailableTokens(gemType)
  const paid = paymentPlan.value[gemType] || 0
  const remaining = Math.max(0, available - paid)
  
  // 调试信息
  if (gemType === 'white') {
    console.log(`getRemainingTokens(${gemType}):`, { available, paid, remaining })
  }
  
  return remaining
}

</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(var(--space-3), env(safe-area-inset-top)) max(var(--space-3), env(safe-area-inset-right)) max(var(--space-3), env(safe-area-inset-bottom)) max(var(--space-3), env(safe-area-inset-left));
  z-index: 1000;
  overflow: hidden;
}

.dialog-content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(600px, 100%);
  min-width: 0;
  background: var(--color-surface, white);
  border-radius: var(--radius-card, 12px);
  max-width: 600px;
  max-height: calc(100vh - 2 * var(--space-3));
  max-height: calc(100dvh - max(var(--space-3), env(safe-area-inset-top)) - max(var(--space-3), env(safe-area-inset-bottom)));
  overflow: hidden;
  box-shadow: var(--shadow-overlay, 0 12px 32px rgba(32, 36, 42, 0.18));
  outline: none;
}

.dialog-content.wide-reserve {
  width: min(540px, 100%);
  max-width: 540px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
  border-bottom: 1px solid #e9ecef;
  min-width: 0;
}

.dialog-header h3 {
  margin: 0;
  color: #495057;
  min-width: 0;
  overflow-wrap: anywhere;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6c757d;
  padding: 0;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #495057;
}

.dialog-body {
  padding: 24px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.dialog-body p {
  margin: 0 0 20px 0;
  color: #495057;
}

.gem-selection, .card-selection, .reserve-selection, .privilege-selection {
  margin-top: 20px;
}

.gem-selection h4, .card-selection h4, .reserve-selection h4, .privilege-selection h4 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 16px;
}

.selected-gems {
  margin-bottom: 16px;
}

.selected-gem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.remove-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
}

.gem-grid-preview {
  border: 2px solid #dee2e6;
  border-radius: 8px;
  padding: 12px;
  background: #f8f9fa;
}

.gem-row {
  display: flex;
  justify-content: center;
}

.gem-cell {
  width: 40px;
  height: 40px;
  border: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2px; /* 四向一致的外边距，保证横纵间距相同 */
  border-radius: 50%;
  position: relative;
}

.gem-cell.has-gem {
  background: white;
}

.gem-cell.clickable {
  cursor: pointer;
}

.gem-cell.clickable:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.gem-cell.selected {
  border-color: #28a745;
  background: #d4edda;
  box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.3);
  transform: scale(1.1);
  z-index: 2;
}

.gem-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.empty-cell {
  color: #6c757d;
  font-size: 10px;
}

.selected-card {
  display: flex;
  align-items: center;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.card-preview {
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  margin-right: 12px;
}

.card-preview-large {
  width: 120px;
  height: 180px;
  object-fit: cover;
  border-radius: 8px;
  margin-right: 12px;
}

.card-info {
  flex: 1;
}

.card-name {
  font-weight: 600;
  color: #495057;
  margin-bottom: 4px;
}

.card-cost {
  font-size: 12px;
  color: #6c757d;
}

.privilege-count {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.privilege-count button {
  width: 48px;
  height: 48px;
  border: 2px solid #dee2e6;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  transition: all 0.2s;
}

.privilege-count button:hover:not(.disabled) {
  border-color: #2196f3;
  background: #e3f2fd;
}

.privilege-count button.selected {
  border-color: #2196f3;
  background: #2196f3;
  color: white;
}

.privilege-count button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e9ecef;
  min-width: 0;
  background: var(--color-surface, white);
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #2196f3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976d2;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.available-cards {
  margin-bottom: 20px;
}

.card-level {
  margin-bottom: 16px;
}

.card-level h5 {
  margin: 0 0 8px 0;
  color: #495057;
  font-size: 14px;
}

.cards-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card-item {
  width: 60px;
  height: 90px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.card-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.card-item.selected {
  border-color: #28a745;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.deck-cards-grid {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.deck-card-item {
  width: 60px;
  height: 90px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  position: relative;
}

.deck-card-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.deck-card-item.selected {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.deck-card-item .card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.deck-card-label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  text-align: center;
  z-index: 1;
}

.card-note {
  font-size: 10px;
  color: #6c757d;
  margin-top: 4px;
}

.cards-by-level {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.level-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  background: #f8f9fa;
}

.level-section h5 {
  margin: 0 0 16px 0;
  color: #495057;
  font-size: 16px;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #dee2e6;
}

.level-content {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.deck-section {
  flex: 0 0 auto;
  text-align: center;
}

.field-cards-section {
  flex: 1;
}

.level-section h6 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 14px;
  text-align: center;
}

.gem-selection-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.clear-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #c82333;
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.payment-section {
  margin-top: 20px;
}

.payment-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.payment-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

.payment-option:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.payment-option.selected {
  border-color: #28a745;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.gem-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gem-icon {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 50%;
}

.gem-name {
  font-size: 14px;
  color: #495057;
}

.cost-info {
  font-size: 12px;
  color: #6c757d;
  display: flex;
  gap: 8px;
}

.required-cost {
  font-weight: 600;
  color: #dc3545;
}

.available-tokens {
  font-size: 12px;
  color: #6c757d;
}

.payment-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.payment-input-field {
  width: 60px;
  height: 36px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: #495057;
  padding: 0 8px;
}

.payment-input-field:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.3);
}

.payment-input-field::-webkit-inner-spin-button,
.payment-input-field::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.payment-input-field[type="number"] {
  -moz-appearance: textfield;
  -webkit-appearance: textfield;
  appearance: textfield;
}

.payment-summary {
  border-top: 1px solid #e9ecef;
  padding-top: 16px;
  margin-top: 16px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #495057;
  margin-bottom: 8px;
}

.summary-item:last-child {
  margin-bottom: 0;
}

.summary-item .insufficient {
  color: #dc3545;
  font-weight: 600;
}

.buy-card-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  min-width: 0;
}

.card-preview-section {
  flex: 0 0 auto;
}

.payment-section {
  flex: 1;
  min-width: 0;
}

.payment-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding: 8px 0;
}

.payment-label {
  font-size: 14px;
  color: #495057;
  font-weight: 500;
  margin-right: 16px;
  min-width: 80px;
}

.token-display {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.token-item {
  display: flex;
  align-items: center;
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 20px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #495057;
  transition: all 0.2s;
  min-width: 40px;
  justify-content: center;
}

.token-item:hover {
  background: #e9ecef;
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.token-item.clickable {
  cursor: pointer;
  background: #e3f2fd;
  border-color: #2196f3;
}

.token-item.clickable:hover {
  background: #bbdefb;
  transform: translateY(-1px);
}

.token-icon {
  width: 20px;
  height: 20px;
  object-fit: cover;
  border-radius: 50%;
  margin-right: 6px;
}

.token-count {
  font-weight: 600;
  color: #dc3545;
  min-width: 16px;
  text-align: center;
}

.payment-note {
  margin-top: 20px;
  padding: 12px 16px;
  background: #e3f2fd;
  border-radius: 8px;
  border-left: 4px solid #2196f3;
  font-size: 12px;
  color: #1976d2;
}

.payment-note p {
  margin: 0;
  line-height: 1.4;
}

/* 宝石丢弃对话框样式 */
.gem-discard {
  padding: 20px 0;
}

.discard-message {
  text-align: center;
  color: #dc3545;
  font-weight: 500;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
}

.gem-display {
  margin-bottom: 20px;
}

.gem-display .gem-row {
  display: flex;
  gap: 22px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.gem-display .gem-row:last-child {
  margin-bottom: 0;
}

.gem-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  background: #ffffff;
  transition: all 0.2s;
  min-width: 88px;
  position: relative;
}

.gem-item.clickable {
  cursor: pointer;
  border-color: #0d6efd; /* 可选：蓝色边框 */
  box-shadow: 0 0 0 2px rgba(13,110,253,0.15) inset;
}

.gem-item.clickable:hover {
  background: #f0f6ff;
  border-color: #0b5ed7;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(13, 110, 253, 0.25);
}

.gem-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: #e9ecef; /* 不可选：浅灰边框 */
}

/* 已选中：使用不同于可选的绿色边框，矩形边框明显可见 */
.gem-item.selected {
  border-color: #198754; /* 已选中：绿色边框 */
  box-shadow: 0 0 0 2px rgba(25,135,84,0.18) inset;
  background: #f6fff8;
}
.gem-item.selected:hover {
  border-color: #146c43;
}

.gem-icon {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 50%;
  margin-bottom: 8px;
  border: 3px solid transparent;
}

.noble-thumb {
  width: 80px;
  height: 120px;
  object-fit: cover;
  border-radius: 10px; /* 圆角矩形 */
  margin-bottom: 8px;
}

.gem-item.selected .gem-icon {
  border-color: transparent;
  box-shadow: none;
}

.gem-count {
  font-size: 16px;
  font-weight: 600;
  color: #495057;
  margin-bottom: 2px;
}

.discard-hint {
  font-size: 10px;
  color: #dc3545;
  text-align: center;
  font-weight: 500;
}

.gem-summary {
  text-align: center;
  padding: 16px;
  background: #e9ecef;
  border-radius: 8px;
  margin-top: 20px;
}

.gem-summary p {
  margin: 8px 0;
  font-weight: 500;
}

.total-count {
  color: #dc3545;
  font-weight: 600;
}

.target-count {
  color: #28a745;
  font-weight: 600;
}

.discard-tip {
  font-size: 12px;
  color: #6c757d;
  font-style: italic;
  text-align: center;
  margin-top: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #007bff;
}

/* 按钮样式 */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  margin-left: 8px;
}

.btn:first-child {
  margin-left: 0;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #5a6268;
}

.btn-warning {
  background-color: #ffc107;
  color: #212529;
}

.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}

@media (max-width: 767px) {
  .dialog-overlay {
    align-items: flex-end;
    padding-top: max(var(--space-3), env(safe-area-inset-top));
    padding-right: max(var(--space-3), env(safe-area-inset-right));
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: max(var(--space-3), env(safe-area-inset-left));
  }

  .dialog-content,
  .dialog-content.wide-reserve {
    width: 100%;
    max-width: none;
    max-height: calc(100vh - max(var(--space-3), env(safe-area-inset-top)));
    max-height: calc(100dvh - max(var(--space-3), env(safe-area-inset-top)));
    border-radius: var(--radius-surface) var(--radius-surface) 0 0;
  }

  .dialog-header {
    padding: var(--space-3) var(--space-3) var(--space-2);
  }

  .dialog-header h3 {
    font-size: 18px;
    line-height: 24px;
  }

  .dialog-body {
    padding: var(--space-3);
  }

  .dialog-body > p {
    margin-bottom: var(--space-3);
  }

  .gem-selection,
  .card-selection,
  .reserve-selection,
  .privilege-selection {
    margin-top: var(--space-3);
  }

  .dialog-footer {
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom));
  }

  .dialog-footer .btn {
    flex: 1 1 96px;
    min-height: 44px;
    margin-left: 0;
  }

  .buy-card-content {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: var(--space-3);
  }

  .card-preview-large {
    width: 88px;
    height: 132px;
    margin-right: 0;
  }

  .payment-section {
    margin-top: 0;
  }

  .payment-section h5 {
    margin-top: 0;
  }

  .payment-row {
    display: block;
    margin-bottom: var(--space-3);
    padding: 0;
  }

  .payment-label {
    margin: 0 0 var(--space-1);
    min-width: 0;
  }

  .token-display {
    gap: var(--space-1);
  }

  .token-item {
    min-width: 38px;
    padding: 4px 7px;
  }

  .token-icon {
    margin-right: 4px;
  }

  .payment-note {
    grid-column: 1 / -1;
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
  }

  .gem-grid-preview {
    padding: var(--space-2);
  }

  .gem-cell {
    width: min(40px, calc((100vw - 72px) / 5));
    height: min(40px, calc((100vw - 72px) / 5));
  }

  .level-section {
    padding: var(--space-3);
  }

  .level-content {
    gap: var(--space-2);
  }

  .gem-display .gem-row {
    gap: var(--space-2);
  }

  .gem-item {
    min-width: 72px;
    padding: var(--space-2);
  }

  .gem-icon {
    width: 48px;
    height: 48px;
  }
}
</style>
