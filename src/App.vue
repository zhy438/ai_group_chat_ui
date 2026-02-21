<template>
  <div class="app-shell">
    <aside class="sidebar" :style="{ width: `${leftWidth}px` }">
      <div class="sidebar-header">
        <div>
          <h2>AI Group Chat</h2>
          <p>多模型协作控制台</p>
        </div>
        <el-button type="primary" @click="createDialog = true">新建群聊</el-button>
      </div>

      <div class="sidebar-body scroll-both">
        <el-empty v-if="!groups.length" description="暂无群聊" />
        <div
          v-for="group in groups"
          :key="group.id"
          class="group-item"
          :class="{ active: currentGroup?.id === group.id }"
          @click="selectGroup(group.id)"
        >
          <div class="group-left">
            <strong># {{ group.name }}</strong>
            <span class="group-id">ID: {{ group.id.slice(0, 8) }}</span>
          </div>
          <span>{{ group.members.length }} 成员</span>
        </div>
      </div>
    </aside>

    <div class="splitter vertical" @mousedown="startDrag('sidebar', $event)"></div>

    <section class="main-area">
      <header class="topbar" v-if="currentGroup">
        <div>
          <h3>{{ currentGroup.name }}</h3>
          <span>{{ currentGroup.members.length }} 成员 · 群ID {{ currentGroup.id.slice(0, 8) }}</span>
        </div>
        <div class="top-actions">
          <el-button @click="managerDialog = true">管理员设置</el-button>
          <el-button @click="memberDialog = true">添加成员</el-button>
          <el-popconfirm title="确定删除该群聊？" @confirm="removeGroup">
            <template #reference>
              <el-button type="danger" plain>删除群聊</el-button>
            </template>
          </el-popconfirm>
        </div>
      </header>

      <main class="content-row" v-if="currentGroup">
        <section class="center-area">
          <div class="messages-panel scroll-both" ref="messageScrollRef">
            <div v-if="!messageList.length" class="placeholder">还没有消息，先发起一轮讨论。</div>

            <div
              v-for="block in renderedMessageBlocks"
              :key="block.id"
            >
              <div
                v-if="block.type === 'chat'"
                class="message-row"
                :class="[messageToneClass(block.message), { me: isMe(block.message) }]"
              >
                <div class="avatar" :class="[messageToneClass(block.message), { me: isMe(block.message) }]">
                  {{ avatarLabel(block.message.sender_name, block.message.role) }}
                </div>

                <div class="message-stack">
                  <div class="sender-line" :class="[messageToneClass(block.message), { me: isMe(block.message) }]">
                    <span class="sender-name">{{ senderName(block.message) }}</span>
                    <span class="sender-id">{{ senderId(block.message) }}</span>
                    <el-tag size="small" :type="block.message.mode === 'qa' ? 'success' : 'warning'">
                      {{ block.message.mode || 'free' }}
                    </el-tag>
                  </div>

                  <div class="bubble" :class="[messageToneClass(block.message), { me: isMe(block.message) }]">
                    <div class="markdown-body" v-html="renderMarkdown(block.message.content)"></div>
                  </div>
                </div>
              </div>

              <div v-else class="qa-block">
                <div v-if="block.question" class="message-row me qa-question">
                  <div class="avatar me">{{ avatarLabel(block.question.sender_name, block.question.role) }}</div>
                  <div class="message-stack">
                    <div class="sender-line me">
                      <span class="sender-name">{{ senderName(block.question) }}</span>
                      <span class="sender-id">{{ senderId(block.question) }}</span>
                      <el-tag size="small" type="success">qa</el-tag>
                    </div>
                    <div class="bubble me">{{ block.question.content }}</div>
                  </div>
                </div>

                <div
                  class="qa-grid"
                  :style="{ gridTemplateColumns: `repeat(${qaColumns()}, minmax(0, 1fr))` }"
                >
                  <article
                    v-for="card in qaCards(block)"
                    :key="card.key"
                    class="qa-card"
                    :class="{ pending: card.pending }"
                  >
                    <header class="qa-card-header">
                      <div class="qa-avatar">{{ avatarLabel(card.sender_name, 'assistant') }}</div>
                      <div class="qa-meta">
                        <strong>{{ card.sender_name }}</strong>
                        <span>{{ senderIdByName(card.sender_name) }}</span>
                      </div>
                    </header>
                    <div class="qa-card-body">
                      <span v-if="card.pending">思考中...</span>
                      <div v-else class="markdown-body" v-html="renderMarkdown(card.content)"></div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div class="splitter horizontal" @mousedown="startDrag('composer', $event)"></div>

          <section class="composer-panel" :style="{ height: `${composerHeight}px` }">
            <el-form inline class="composer-form">
              <el-form-item label="昵称">
                <el-input v-model="userName" style="width: 120px" />
              </el-form-item>
              <el-form-item label="用户ID">
                <el-input v-model="userId" style="width: 150px" />
              </el-form-item>
              <el-form-item label="轮数">
                <el-input-number v-model="maxRounds" :min="1" :max="10" />
              </el-form-item>
              <el-form-item label="模式">
                <el-segmented v-model="mode" :options="modeOptions" />
              </el-form-item>
            </el-form>

            <el-input
              v-model="question"
              :rows="3"
              type="textarea"
              placeholder="输入问题，支持 free 和 一问一答模式无缝切换"
            />

            <div class="composer-actions">
              <el-button type="primary" :loading="isDiscussing" @click="startDiscussion">开始讨论</el-button>
              <el-button type="danger" plain :disabled="!isDiscussing" @click="stopDiscussion">终止讨论</el-button>
              <el-button :loading="isSummarizing" @click="summarize">得出结论</el-button>
            </div>
          </section>
        </section>

        <div class="splitter vertical" @mousedown="startDrag('right', $event)"></div>

        <aside class="right-area" :style="{ width: `${rightWidth}px` }">
          <section class="members-panel" :style="{ height: `${rightTopHeight}px` }">
            <div class="panel-title">成员列表</div>
            <div class="members-body scroll-both">
              <el-empty v-if="!currentGroup.members.length" description="暂无成员" />
              <div v-for="m in currentGroup.members" :key="m.id" class="member-row">
                <div class="member-main">
                  <strong>{{ m.name }}</strong>
                  <span class="member-id">{{ m.model_id }}</span>
                </div>
                <div class="member-actions">
                  <el-switch
                    :model-value="m.thinking"
                    size="small"
                    @change="(v) => patchMember(m.id, { thinking: v })"
                  />
                  <el-popconfirm title="移除该成员？" @confirm="removeMember(m.id)">
                    <template #reference>
                      <el-button link type="danger">移除</el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </div>
            </div>
          </section>

          <div class="splitter horizontal" @mousedown="startDrag('rightTop', $event)"></div>

          <section class="stats-panel scroll-both">
            <div class="panel-title line">
              <span>上下文状态</span>
              <el-button link @click="loadContextStats">刷新</el-button>
            </div>
            <div class="stats-line">
              <span>Token</span>
              <strong>{{ stats.current_tokens || 0 }} / {{ stats.compression_config?.max_tokens || '-' }}</strong>
            </div>
            <div class="stats-line">
              <span>阈值（{{ thresholdMetaText }}）</span>
              <el-slider
                v-model="threshold"
                :min="0.1"
                :max="1"
                :step="0.05"
                @change="updateThreshold"
              />
            </div>
            <div class="stats-line">
              <span>消息数</span>
              <strong>{{ stats.message_count || 0 }}</strong>
            </div>

            <div class="panel-title line memory-title">
              <span>长期记忆</span>
              <el-button link @click="refreshMemory">刷新</el-button>
            </div>
            <div class="stats-line compact">
              <span>记录数 / 死信</span>
              <strong>{{ memoryStats.total_records || 0 }} / {{ memoryStats.dead_letter_count || 0 }}</strong>
            </div>

            <div class="memory-grid">
              <div class="memory-item">
                <span>总开关</span>
                <el-switch v-model="memorySettings.memory_enabled" @change="saveMemorySettings" />
              </div>
              <div class="memory-item">
                <span>归档</span>
                <el-switch v-model="memorySettings.archive_enabled" @change="saveMemorySettings" />
              </div>
              <div class="memory-item">
                <span>检索</span>
                <el-switch v-model="memorySettings.retrieve_enabled" @change="saveMemorySettings" />
              </div>
              <div class="memory-item">
                <span>User跨群</span>
                <el-switch v-model="memorySettings.scope_user_global" @change="saveMemorySettings" />
              </div>
              <div class="memory-item">
                <span>Group群内</span>
                <el-switch v-model="memorySettings.scope_group_local" @change="saveMemorySettings" />
              </div>
              <div class="memory-item">
                <span>Agent群内</span>
                <el-switch v-model="memorySettings.scope_agent_local" @change="saveMemorySettings" />
              </div>
            </div>

            <div class="stats-line compact">
              <span>注入占比（{{ Math.round((memorySettings.memory_injection_ratio || 0) * 100) }}%）</span>
              <el-slider
                v-model="memorySettings.memory_injection_ratio"
                :min="0.05"
                :max="0.5"
                :step="0.05"
                @change="saveMemorySettings"
              />
            </div>
            <div class="stats-line compact">
              <span>TopN（{{ memorySettings.memory_top_n || 5 }}）</span>
              <el-slider
                v-model="memorySettings.memory_top_n"
                :min="1"
                :max="10"
                :step="1"
                @change="saveMemorySettings"
              />
            </div>
          </section>
        </aside>
      </main>

      <main v-else class="blank-state">
        <el-empty description="请选择或创建群聊" />
      </main>
    </section>
  </div>

  <el-dialog v-model="createDialog" title="创建群聊" width="420px">
    <el-form>
      <el-form-item label="群聊名称"><el-input v-model="newGroupName" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createDialog = false">取消</el-button>
      <el-button type="primary" @click="createGroup">创建</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="memberDialog" title="添加成员" width="520px">
    <el-form label-width="92px">
      <el-form-item label="模型">
        <el-select v-model="memberForm.model_id" style="width: 100%">
          <el-option
            v-for="m in models"
            :key="m.model_id"
            :label="`${m.name} (${m.context_window / 1000}k)`"
            :value="m.model_id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="专属人设"><el-input v-model="memberForm.description" type="textarea" :rows="3" placeholder="例如：你是严谨的架构师，回答先给结论再给理由，必要时给出风险清单。" /></el-form-item>
      <el-form-item label="温度"><el-slider v-model="memberForm.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
      <el-form-item label="Thinking"><el-switch v-model="memberForm.thinking" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="memberDialog = false">取消</el-button>
      <el-button type="primary" @click="addMember">添加</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="managerDialog" title="管理员设置" width="520px">
    <el-form label-width="110px">
      <el-form-item label="模型">
        <el-select v-model="managerForm.model_id" style="width: 100%">
          <el-option v-for="m in models" :key="m.model_id" :label="m.name" :value="m.model_id" />
        </el-select>
      </el-form-item>
      <el-form-item label="温度"><el-slider v-model="managerForm.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
      <el-form-item label="Thinking"><el-switch v-model="managerForm.thinking" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="managerDialog = false">取消</el-button>
      <el-button type="primary" @click="saveManager">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiBase, apiClient } from './api/client'

const groups = ref([])
const models = ref([])
const currentGroup = ref(null)
const messageList = ref([])
const stats = ref({})
const threshold = ref(0.8)
const memoryStats = ref({})
const memorySettings = ref({
  memory_enabled: true,
  archive_enabled: true,
  retrieve_enabled: true,
  scope_user_global: true,
  scope_group_local: true,
  scope_agent_local: true,
  memory_injection_ratio: 0.2,
  memory_top_n: 5,
  memory_min_confidence: 0.75,
  memory_score_threshold: 0.35,
})

const createDialog = ref(false)
const memberDialog = ref(false)
const managerDialog = ref(false)

const newGroupName = ref('')
const question = ref('')
const userName = ref('用户')
const userId = ref('default-user')
const maxRounds = ref(2)
const mode = ref('free')
const modeOptions = [
  { label: '自由讨论', value: 'free' },
  { label: '一问一答', value: 'qa' },
]

const isDiscussing = ref(false)
const isSummarizing = ref(false)
const abortController = ref(null)
const messageScrollRef = ref(null)

const memberForm = ref({
  model_id: '',
  description: '',
  temperature: 0.7,
  thinking: false,
})

const managerForm = ref({
  model_id: '',
  temperature: 0.7,
  thinking: false,
})

const leftWidth = ref(280)
const rightWidth = ref(350)
const composerHeight = ref(210)
const rightTopHeight = ref(320)
const dragState = ref(null)

const thresholdMetaText = computed(() => {
  const config = stats.value?.compression_config
  if (!config) return '-'
  const thresholdTokens = config.threshold_tokens ?? '-'
  const ratio = Math.round((config.threshold_ratio ?? threshold.value ?? 0) * 100)
  return `${thresholdTokens} tokens，${ratio}%`
})

const renderedMessageBlocks = computed(() => {
  const blocks = []
  let currentQa = null

  for (const msg of messageList.value) {
    const msgMode = msg.mode || 'free'
    if (msgMode === 'qa') {
      if (msg.role === 'user') {
        if (currentQa) {
          blocks.push(currentQa)
        }
        currentQa = {
          id: `qa-${msg.id}`,
          type: 'qa',
          question: msg,
          answers: [],
        }
      } else {
        if (!currentQa) {
          currentQa = {
            id: `qa-orphan-${msg.id}`,
            type: 'qa',
            question: null,
            answers: [],
          }
        }
        currentQa.answers.push(msg)
      }
      continue
    }

    if (currentQa) {
      blocks.push(currentQa)
      currentQa = null
    }

    blocks.push({
      id: `chat-${msg.id}`,
      type: 'chat',
      message: msg,
    })
  }

  if (currentQa) {
    blocks.push(currentQa)
  }

  return blocks
})

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function startDrag(type, event) {
  event.preventDefault()
  dragState.value = {
    type,
    x: event.clientX,
    y: event.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    composerHeight: composerHeight.value,
    rightTopHeight: rightTopHeight.value,
  }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(event) {
  if (!dragState.value) return
  const s = dragState.value
  const dx = event.clientX - s.x
  const dy = event.clientY - s.y

  if (s.type === 'sidebar') {
    leftWidth.value = clamp(s.leftWidth + dx, 220, Math.min(520, window.innerWidth - 820))
  }

  if (s.type === 'right') {
    rightWidth.value = clamp(s.rightWidth - dx, 280, Math.min(560, window.innerWidth - 760))
  }

  if (s.type === 'composer') {
    composerHeight.value = clamp(s.composerHeight - dy, 150, Math.min(420, window.innerHeight - 220))
  }

  if (s.type === 'rightTop') {
    rightTopHeight.value = clamp(s.rightTopHeight + dy, 180, Math.min(540, window.innerHeight - 220))
  }
}

function stopDrag() {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
  dragState.value = null
}

function isMe(msg) {
  return msg.role === 'user'
}

function senderName(msg) {
  return msg.sender_name || (msg.role === 'user' ? userName.value : 'assistant')
}

function senderId(msg) {
  return `@${senderName(msg)}`
}

function senderIdByName(name) {
  return `@${name || 'assistant'}`
}
function messageToneClass(msg) {
  if (!msg) return 'tone-member'
  if (msg.role === 'system' || msg.sender_name === '系统') return 'tone-system'
  if (msg.sender_name === '总结助手') return 'tone-summary'
  if (msg.role === 'user') return 'tone-user'
  return 'tone-member'
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttr(input) {
  return escapeHtml(input).replace(/`/g, '&#96;')
}

function renderInlineMarkdown(line) {
  const source = String(line ?? '')
  const tokens = []
  let staged = source.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = '__MD_TOKEN_' + tokens.length + '__'
    tokens.push({ type: 'code', code })
    return token
  })

  staged = staged.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) => {
    const token = '__MD_TOKEN_' + tokens.length + '__'
    tokens.push({ type: 'link', label, href })
    return token
  })

  let html = escapeHtml(staged)
  html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br />')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')

  html = html.replace(/__MD_TOKEN_(\d+)__/g, (_, idx) => {
    const token = tokens[Number(idx)]
    if (!token) return ''
    if (token.type === 'code') {
      return '<code>' + escapeHtml(token.code) + '</code>'
    }
    return '<a href="' + escapeHtmlAttr(token.href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(token.label) + '</a>'
  })

  return html
}

function splitTableCells(line) {
  const raw = String(line ?? '').trim()
  if (!raw.includes('|')) return null

  let normalized = raw
  if (normalized.startsWith('|')) normalized = normalized.slice(1)
  if (normalized.endsWith('|')) normalized = normalized.slice(0, -1)

  const cells = normalized.split('|').map((cell) => cell.trim())
  if (cells.length < 2) return null
  return cells
}

function isTableSeparator(line) {
  const cells = splitTableCells(line)
  if (!cells) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdown(content) {
  const source = String(content ?? '').replace(/\r\n?/g, '\n')
  if (!source.trim()) return ''

  const lines = source.split('\n')
  const blocks = []
  let paragraph = []
  let listType = null
  let listItems = []
  let quoteLines = []
  let inCode = false
  let codeLang = ''
  let codeLines = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    const body = paragraph.map((line) => renderInlineMarkdown(line)).join('<br />')
    blocks.push('<p>' + body + '</p>')
    paragraph = []
  }

  const flushList = () => {
    if (!listType || !listItems.length) return
    const tag = listType
    const items = listItems.map((item) => '<li>' + renderInlineMarkdown(item) + '</li>').join('')
    blocks.push('<' + tag + '>' + items + '</' + tag + '>')
    listType = null
    listItems = []
  }

  const flushQuote = () => {
    if (!quoteLines.length) return
    const body = quoteLines.map((line) => renderInlineMarkdown(line)).join('<br />')
    blocks.push('<blockquote>' + body + '</blockquote>')
    quoteLines = []
  }

  const flushCode = () => {
    const langClass = codeLang ? ' class="language-' + escapeHtmlAttr(codeLang) + '"' : ''
    blocks.push('<pre><code' + langClass + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>')
    inCode = false
    codeLang = ''
    codeLines = []
  }

  const renderTable = (headerCells, bodyRows) => {
    const width = headerCells.length
    const normalizeRow = (cells) => {
      const row = cells.slice(0, width)
      while (row.length < width) row.push('')
      return row
    }

    const headerHtml = '<tr>' + normalizeRow(headerCells).map((cell) => '<th>' + renderInlineMarkdown(cell) + '</th>').join('') + '</tr>'
    const bodyHtml = bodyRows
      .map((cells) => '<tr>' + normalizeRow(cells).map((cell) => '<td>' + renderInlineMarkdown(cell) + '</td>').join('') + '</tr>')
      .join('')

    blocks.push('<table><thead>' + headerHtml + '</thead><tbody>' + bodyHtml + '</tbody></table>')
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    const fence = line.match(/^```([a-zA-Z0-9_-]+)?\s*$/)
    if (fence) {
      flushParagraph()
      flushList()
      flushQuote()
      if (inCode) {
        flushCode()
      } else {
        inCode = true
        codeLang = fence[1] || ''
        codeLines = []
      }
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    const maybeHeader = splitTableCells(line)
    const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
    if (maybeHeader && isTableSeparator(nextLine)) {
      flushParagraph()
      flushList()
      flushQuote()

      const rows = []
      i += 1
      while (i + 1 < lines.length) {
        const candidate = lines[i + 1]
        const cells = splitTableCells(candidate)
        if (!cells || !candidate.trim() || isTableSeparator(candidate)) break
        rows.push(cells)
        i += 1
      }

      renderTable(maybeHeader, rows)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      flushQuote()
      continue
    }

    const quoteMatch = line.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      quoteLines.push(quoteMatch[1])
      continue
    }
    flushQuote()

    const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/)
    if (ulMatch) {
      flushParagraph()
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(ulMatch[1])
      continue
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/)
    if (olMatch) {
      flushParagraph()
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(olMatch[1])
      continue
    }
    flushList()

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph()
      blocks.push('<hr />')
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      const level = headingMatch[1].length
      blocks.push('<h' + level + '>' + renderInlineMarkdown(headingMatch[2]) + '</h' + level + '>')
      continue
    }

    paragraph.push(line)
  }

  if (inCode) flushCode()
  flushParagraph()
  flushList()
  flushQuote()

  return blocks.join('')
}

function avatarLabel(name, role) {
  if (role === 'user') return (name || userName.value || 'U').slice(0, 1).toUpperCase()
  return (name || 'AI').slice(0, 1).toUpperCase()
}

function applyRealtimeStats(payload) {
  if (!payload) return
  stats.value = payload
  if (payload.memory_stats) {
    memoryStats.value = payload.memory_stats
  }
  if (payload.compression_config?.threshold_ratio !== undefined) {
    threshold.value = payload.compression_config.threshold_ratio
    if (currentGroup.value) {
      currentGroup.value.compression_threshold = payload.compression_config.threshold_ratio
      syncGroupInSidebar(currentGroup.value)
    }
  }
}

function qaColumns() {
  const count = currentGroup.value?.members?.length || 1
  return clamp(count, 1, 3)
}

function qaCards(block) {
  const cards = []
  const members = currentGroup.value?.members || []
  const answerMap = new Map()

  for (const answer of block.answers) {
    if (answer?.sender_name) {
      answerMap.set(answer.sender_name, answer)
    }
  }

  for (const member of members) {
    const existing = answerMap.get(member.name)
    cards.push({
      key: `${block.id}-${member.name}`,
      sender_name: member.name,
      content: existing?.content || '',
      pending: !existing,
    })
    answerMap.delete(member.name)
  }

  for (const answer of answerMap.values()) {
    cards.push({
      key: `${block.id}-${answer.id || answer.sender_name}`,
      sender_name: answer.sender_name || 'assistant',
      content: answer.content || '',
      pending: false,
    })
  }

  return cards
}

async function loadModels() {
  const { data } = await apiClient.getModels()
  models.value = data
  if (!memberForm.value.model_id && data.length) memberForm.value.model_id = data[0].model_id
  if (!managerForm.value.model_id && data.length) managerForm.value.model_id = data[0].model_id
}

async function loadGroups() {
  const { data } = await apiClient.listGroups()
  groups.value = data
}

async function selectGroup(groupId) {
  const [{ data: group }, { data: msgs }] = await Promise.all([
    apiClient.getGroup(groupId),
    apiClient.getMessages(groupId, 300),
  ])

  currentGroup.value = group
  messageList.value = msgs
  syncGroupInSidebar(group)
  managerForm.value.model_id = group.manager_model || managerForm.value.model_id
  managerForm.value.thinking = !!group.manager_thinking
  managerForm.value.temperature = group.manager_temperature ?? 0.7
  threshold.value = group.compression_threshold ?? 0.8
  memorySettings.value = {
    ...memorySettings.value,
    memory_enabled: group.memory_enabled ?? true,
    archive_enabled: group.archive_enabled ?? true,
    retrieve_enabled: group.retrieve_enabled ?? true,
    scope_user_global: group.scope_user_global ?? true,
    scope_group_local: group.scope_group_local ?? true,
    scope_agent_local: group.scope_agent_local ?? true,
    memory_injection_ratio: group.memory_injection_ratio ?? 0.2,
    memory_top_n: group.memory_top_n ?? 5,
    memory_min_confidence: group.memory_min_confidence ?? 0.75,
    memory_score_threshold: group.memory_score_threshold ?? 0.35,
  }

  await Promise.all([loadContextStats(), loadMemorySettings(), loadMemoryStats()])
  await scrollBottom()
}

function syncGroupInSidebar(group) {
  const index = groups.value.findIndex((g) => g.id === group.id)
  if (index === -1) return
  groups.value[index] = {
    ...groups.value[index],
    ...group,
  }
}

async function createGroup() {
  if (!newGroupName.value.trim()) {
    ElMessage.warning('请输入群聊名称')
    return
  }
  await apiClient.createGroup({ name: newGroupName.value.trim() })
  ElMessage.success('创建成功')
  newGroupName.value = ''
  createDialog.value = false
  await loadGroups()
}

async function removeGroup() {
  if (!currentGroup.value) return
  await apiClient.deleteGroup(currentGroup.value.id)
  ElMessage.success('群聊已删除')
  currentGroup.value = null
  messageList.value = []
  await loadGroups()
}

async function addMember() {
  if (!currentGroup.value) return
  const payload = {
    name: memberForm.value.model_id,
    model_id: memberForm.value.model_id,
    description: memberForm.value.description || null,
    temperature: memberForm.value.temperature,
    thinking: memberForm.value.thinking,
  }
  await apiClient.addMember(currentGroup.value.id, payload)
  ElMessage.success('成员已添加')
  memberDialog.value = false
  memberForm.value.description = ''
  memberForm.value.temperature = 0.7
  memberForm.value.thinking = false
  await selectGroup(currentGroup.value.id)
}

async function patchMember(memberId, payload) {
  if (!currentGroup.value) return
  await apiClient.updateMember(currentGroup.value.id, memberId, payload)
  ElMessage.success('成员参数已更新')
  await selectGroup(currentGroup.value.id)
}

async function removeMember(memberId) {
  if (!currentGroup.value) return
  await apiClient.removeMember(currentGroup.value.id, memberId)
  ElMessage.success('成员已移除')
  await selectGroup(currentGroup.value.id)
}

async function saveManager() {
  if (!currentGroup.value) return
  await apiClient.setManager(currentGroup.value.id, {
    model_id: managerForm.value.model_id,
    thinking: managerForm.value.thinking,
    temperature: managerForm.value.temperature,
  })
  ElMessage.success('管理员配置已更新')
  managerDialog.value = false
  await selectGroup(currentGroup.value.id)
}

async function loadContextStats() {
  if (!currentGroup.value) return
  const { data } = await apiClient.getContextStats(currentGroup.value.id)
  stats.value = data
  if (data.memory_stats) {
    memoryStats.value = data.memory_stats
  }
}

async function loadMemorySettings() {
  if (!currentGroup.value) return
  const { data } = await apiClient.getMemorySettings(currentGroup.value.id)
  memorySettings.value = {
    ...memorySettings.value,
    ...data,
  }
}

async function loadMemoryStats() {
  if (!currentGroup.value) return
  const { data } = await apiClient.getMemoryStats(currentGroup.value.id)
  memoryStats.value = data
}

async function saveMemorySettings() {
  if (!currentGroup.value) return
  const payload = {
    ...memorySettings.value,
  }
  try {
    await apiClient.updateMemorySettings(currentGroup.value.id, payload)
    currentGroup.value = {
      ...currentGroup.value,
      ...payload,
    }
    syncGroupInSidebar(currentGroup.value)
    await loadMemoryStats()
  } catch (err) {
    ElMessage.error(err?.message || '长期记忆配置保存失败')
  }
}

async function refreshMemory() {
  await Promise.all([loadMemorySettings(), loadMemoryStats()])
}

async function updateThreshold(value) {
  if (!currentGroup.value) return
  const previous = currentGroup.value.compression_threshold ?? 0.8
  currentGroup.value.compression_threshold = value
  try {
    await apiClient.setThreshold(currentGroup.value.id, { threshold: value })
    ElMessage.success(`压缩阈值更新为 ${Math.round(value * 100)}%`)
    await loadContextStats()
    syncGroupInSidebar(currentGroup.value)
  } catch (err) {
    threshold.value = previous
    currentGroup.value.compression_threshold = previous
    ElMessage.error(err?.message || '阈值更新失败')
  }
}

function appendMessage(msg) {
  const id = msg.id || `${msg.sender_name}-${Date.now()}-${Math.random()}`
  messageList.value.push({ ...msg, id })
}

async function startDiscussion() {
  if (!currentGroup.value) {
    ElMessage.warning('请先选择群聊')
    return
  }
  if (!question.value.trim()) {
    ElMessage.warning('请输入问题内容')
    return
  }

  isDiscussing.value = true
  abortController.value = new AbortController()

  const payload = {
    content: question.value,
    user_name: userName.value || '用户',
    user_id: userId.value || 'default-user',
    max_rounds: maxRounds.value,
    mode: mode.value,
  }

  appendMessage({
    role: 'user',
    sender_name: payload.user_name,
    content: payload.content,
    mode: payload.mode,
  })

  const pendingQuestion = question.value
  question.value = ''

  try {
    const response = await fetch(`${apiBase}/groups/${currentGroup.value.id}/discuss/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.value.signal,
    })

    if (!response.ok) throw new Error('讨论请求失败')

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let hasError = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = JSON.parse(line.slice(6))
        if (data.type === 'message') {
          appendMessage({ ...data, role: 'assistant', mode: payload.mode })
          await scrollBottom()
        }
        if (data.type === 'stats') {
          applyRealtimeStats(data.stats)
        }
        if (data.type === 'error') {
          hasError = true
          throw new Error(data.message || '讨论异常')
        }
      }
    }

    if (!hasError) {
      ElMessage.success(`本轮${payload.mode === 'qa' ? '一问一答' : '自由讨论'}已结束`)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      ElMessage.warning('讨论已终止')
    } else {
      ElMessage.error(err.message || '讨论失败')
      question.value = pendingQuestion
    }
  } finally {
    isDiscussing.value = false
    abortController.value = null
    await selectGroup(currentGroup.value.id)
  }
}

function stopDiscussion() {
  if (abortController.value) abortController.value.abort()
}

async function summarize() {
  if (!currentGroup.value) return
  isSummarizing.value = true

  try {
    const response = await fetch(`${apiBase}/groups/${currentGroup.value.id}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: '请对上述讨论提炼结论和可执行建议。',
        user_name: userName.value || '用户',
        user_id: userId.value || 'default-user',
      }),
    })

    if (!response.ok) throw new Error('总结请求失败')

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let hasError = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = JSON.parse(line.slice(6))
        if (data.type === 'message') {
          appendMessage({ ...data, role: 'assistant', mode: 'free' })
          await scrollBottom()
        }
        if (data.type === 'stats') {
          applyRealtimeStats(data.stats)
        }
        if (data.type === 'error') {
          hasError = true
          throw new Error(data.message || '总结异常')
        }
      }
    }

    if (!hasError) {
      ElMessage.success('总结完成')
    }
  } catch (err) {
    ElMessage.error(err.message || '总结失败')
  } finally {
    isSummarizing.value = false
    await selectGroup(currentGroup.value.id)
  }
}

async function scrollBottom() {
  await nextTick()
  const el = messageScrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(async () => {
  try {
    await Promise.all([loadModels(), loadGroups()])
  } catch (err) {
    ElMessage.error(err.message || '初始化失败')
  }
})

onBeforeUnmount(() => {
  stopDrag()
})
</script>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  color: #1f2329;
}

.sidebar {
  height: 100%;
  min-width: 220px;
  max-width: 520px;
  border-right: 1px solid #e6eaf2;
  background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e6eaf2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 28px;
  line-height: 1;
}

.sidebar-header p {
  margin: 6px 0 0;
  color: #7a869a;
  font-size: 13px;
}

.sidebar-body {
  flex: 1;
  padding: 12px;
}

.group-item {
  border: 1px solid #dde5f0;
  border-radius: 14px;
  background: #fff;
  padding: 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  gap: 8px;
}

.group-item.active {
  border-color: #5f8fff;
  box-shadow: 0 0 0 2px rgba(95, 143, 255, 0.2);
}

.group-left {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.group-id {
  color: #8a95a8;
  font-size: 12px;
}

.main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 72px;
  border-bottom: 1px solid #e6eaf2;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.topbar h3 {
  margin: 0;
  font-size: 24px;
}

.topbar span {
  color: #7f8da1;
  font-size: 12px;
}

.top-actions {
  display: flex;
  gap: 8px;
}

.content-row {
  flex: 1;
  min-height: 0;
  display: flex;
}

.center-area {
  flex: 1;
  min-width: 360px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}

.messages-panel {
  flex: 1;
  min-height: 0;
  background: linear-gradient(180deg, #f9fbff 0%, #f6f8fc 100%);
  border: 1px solid #e6ebf5;
  border-radius: 14px;
  padding: 14px;
}

.placeholder {
  text-align: center;
  margin-top: 60px;
  color: #94a0b4;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.qa-block {
  margin-bottom: 14px;
}

.qa-question {
  margin-bottom: 10px;
}

.qa-grid {
  display: grid;
  gap: 10px;
  align-items: stretch;
}

.qa-card {
  border: 1px solid #d7e2f1;
  background: #ffffff;
  border-radius: 12px;
  padding: 10px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(16, 35, 64, 0.05);
}

.qa-card.pending {
  border-style: dashed;
  background: #f8fbff;
}

.qa-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e6ebf5;
}

.qa-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #e0e8f8;
  color: #344159;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.qa-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.qa-meta strong {
  font-size: 13px;
  color: #33435d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qa-meta span {
  color: #95a0b2;
  font-size: 11px;
}

.qa-card-body {
  word-break: break-word;
  line-height: 1.55;
  color: #263548;
  flex: 1;
  overflow: auto;
}

.message-row.me {
  flex-direction: row-reverse;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #dce5f5;
  color: #344159;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.avatar.me {
  background: #7bb3ff;
  color: #fff;
}
.avatar.tone-system {
  background: #dce2ea;
  color: #405065;
}

.avatar.tone-summary {
  background: #ffe8c2;
  color: #714600;
}

.avatar.tone-member {
  background: #dce5f5;
  color: #344159;
}


.message-stack {
  max-width: min(72%, 760px);
  min-width: 90px;
}

.sender-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7b8799;
  font-size: 12px;
  margin-bottom: 4px;
}

.sender-line.me {
  justify-content: flex-end;
}

.sender-name {
  color: #43516b;
  font-weight: 600;
}

.sender-id {
  color: #95a0b2;
}

.bubble {
  border-radius: 4px 16px 16px 16px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #dce3ef;
  line-height: 1.55;
  word-break: break-word;
  box-shadow: 0 2px 8px rgba(20, 35, 60, 0.04);
}

.bubble.me {
  border-radius: 16px 4px 16px 16px;
  background: #cbe5ff;
  border-color: #9bc9ff;
}

.bubble.tone-member {
  background: #ffffff;
  border-color: #dce3ef;
}

.bubble.tone-summary {
  background: #fff3da;
  border-color: #f5d7a1;
}

.bubble.tone-system {
  background: #eef2f7;
  border-color: #d2dbe8;
  color: #2f3a4d;
}

.sender-line.tone-system .sender-name {
  color: #3a4b62;
}

.sender-line.tone-summary .sender-name {
  color: #7a4d00;
}

.markdown-body {
  color: inherit;
  font-size: 14px;
  line-height: 1.6;
}

:deep(.markdown-body p) {
  margin: 0 0 8px;
}

:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  margin: 4px 0 8px;
  line-height: 1.35;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 0 0 8px 18px;
  padding: 0;
}

:deep(.markdown-body li + li) {
  margin-top: 4px;
}

:deep(.markdown-body blockquote) {
  margin: 4px 0 8px;
  padding: 6px 10px;
  border-left: 3px solid #b9c8df;
  background: rgba(181, 197, 220, 0.14);
  color: #37485f;
}

:deep(.markdown-body pre) {
  margin: 6px 0;
  padding: 10px;
  border-radius: 8px;
  background: #f3f6fb;
  border: 1px solid #d9e1ef;
  overflow-x: auto;
}

:deep(.markdown-body code) {
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
}

:deep(.markdown-body pre code) {
  background: transparent;
  padding: 0;
}

:deep(.markdown-body :not(pre) > code) {
  background: #eef3fb;
  border: 1px solid #d7e1f1;
  border-radius: 4px;
  padding: 1px 5px;
}

:deep(.markdown-body a) {
  color: #2f6cf6;
  text-decoration: none;
}

:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

:deep(.markdown-body hr) {
  border: 0;
  border-top: 1px solid #d9e1ef;
  margin: 10px 0;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  display: block;
  overflow-x: auto;
}

:deep(.markdown-body thead) {
  background: #ecf3ff;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid #d9e1ef;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
  min-width: 100px;
}

:deep(.markdown-body th) {
  font-weight: 600;
  color: #2f3e57;
}


.composer-panel {
  background: #fff;
  border: 1px solid #e6ebf5;
  border-radius: 14px;
  padding: 12px;
  min-height: 150px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.composer-form {
  margin-bottom: -8px;
}

.composer-actions {
  display: flex;
  gap: 10px;
}

.right-area {
  min-width: 280px;
  max-width: 560px;
  border-left: 1px solid #e6ebf5;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.members-panel,
.stats-panel {
  border: 1px solid #e6ebf5;
  border-radius: 14px;
  background: #fff;
}

.members-panel {
  min-height: 180px;
  max-height: 540px;
  display: flex;
  flex-direction: column;
}

.members-body {
  flex: 1;
  padding: 8px 10px 10px;
}

.member-row {
  border-bottom: 1px dashed #e5eaf3;
  padding: 10px 2px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.member-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.member-id {
  font-size: 12px;
  color: #8d98a9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-title {
  padding: 10px 12px;
  font-weight: 700;
  border-bottom: 1px solid #edf1f8;
}

.panel-title.line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-panel {
  flex: 1;
  min-height: 160px;
  padding-bottom: 10px;
}

.stats-line {
  padding: 10px 12px 0;
}

.stats-line span {
  color: #7a869a;
  font-size: 13px;
}

.stats-line strong {
  display: block;
  margin-top: 4px;
}

.memory-title {
  margin-top: 10px;
}

.stats-line.compact {
  padding-top: 8px;
}

.memory-grid {
  padding: 4px 12px 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.memory-item {
  border: 1px dashed #dce5f3;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #f9fbff;
}

.memory-item span {
  color: #60708b;
  font-size: 12px;
}

.blank-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.splitter {
  position: relative;
  flex-shrink: 0;
  background: transparent;
}

.splitter.vertical {
  width: 6px;
  cursor: col-resize;
}

.splitter.horizontal {
  height: 6px;
  cursor: row-resize;
}

.splitter::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(108, 140, 205, 0.25);
  opacity: 0;
  transition: opacity 0.15s;
}

.splitter:hover::after {
  opacity: 1;
}

.scroll-both {
  overflow: auto;
}

.scroll-both::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.scroll-both::-webkit-scrollbar-thumb {
  background: #c8d2e3;
  border-radius: 8px;
}

.scroll-both::-webkit-scrollbar-track {
  background: transparent;
}

@media (max-width: 1200px) {
  .topbar {
    padding: 0 10px;
  }

  .top-actions {
    gap: 4px;
  }

  .message-stack {
    max-width: min(88%, 680px);
  }
}
</style>
