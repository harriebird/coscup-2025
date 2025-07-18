<script setup lang="ts">
import type { SubmissionResponse } from '#loaders/types.ts'
import type { Locale } from './session-messages.ts'
import type SessionModal from './SessionModal.vue'
import CCard from '#/components/CCard.vue'
import CIconButton from '#/components/CIconButton.vue'
import CMenuBar from '#/components/CMenuBar.vue'
import { END_HOUR, SessionScheduleLayout, START_HOUR, TIME_SLOT_HEIGHT } from '#utils/session-layout.ts'
import { useSessionStorage, useStorage } from '@vueuse/core'
import { useRouter } from 'vitepress'
import { computed, nextTick, onMounted } from 'vue'
import { messages } from './session-messages.ts'
import SessionDateButton from './SessionDateButton.vue'
import { useScrollFade } from './useScrollFade.ts'

const props = defineProps<{
  sessionCode: string | undefined
  submissions: SubmissionResponse[]
  locale: Locale
}>()

// Bookmarked sessions state
const bookmarkedSessions = useStorage('bookmarked-sessions', new Set<string>())

// View state
const selectedView = useStorage<'conference' | 'bookmarked'>('selected-view', 'conference')

// Menu items for view toggle
const viewMenuItems = computed(() => [
  { key: 'conference', label: messages[props.locale].conference || 'Conference' },
  { key: 'bookmarked', label: messages[props.locale].bookmarked || 'Bookmarked' },
])

// Date selection state
const selectedDate = useStorage<'Aug.9' | 'Aug.10'>('selected-date', 'Aug.9')

// Generate time slots from 8AM to 6PM
const timeSlots = computed(() => {
  const slots = []
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    const displayHour = hour <= 12 ? hour : hour - 12
    const period = hour < 12 ? 'AM' : 'PM'
    const displayTime = hour === 12 ? '12PM' : `${displayHour}${period}`
    slots.push(displayTime)
  }
  return slots
})

const layout = new SessionScheduleLayout(props.submissions)

// Extract unique rooms from submissions
const rooms = computed(() => {
  const roomMap = new Map()

  props.submissions.forEach((submission) => {
    if (submission.room) {
      roomMap.set(submission.room.id, submission.room)
    }
  })

  // Sort rooms alphabetically by name
  // RB105 should be the first room, then the rest sorted alphabetically
  return Array.from(roomMap.values()).sort((a, b) => {
    if (a.name === 'RB105') return -1
    if (b.name === 'RB105') return 1
    return a.name.localeCompare(b.name)
  })
})

// Get sessions for display
const displaySessions = computed(() => {
  const filteredSessions = props.submissions.filter((session) => {
    if (!session.start) return false
    const startDate = new Date(session.start)
    // Conference dates: 2025-08-09 and 2025-08-10
    if (selectedDate.value === 'Aug.9') {
      return startDate.getFullYear() === 2025 && startDate.getMonth() === 7 && startDate.getDate() === 9
    } else {
      return startDate.getFullYear() === 2025 && startDate.getMonth() === 7 && startDate.getDate() === 10
    }
  })

  if (selectedView.value === 'bookmarked') {
    return filteredSessions.filter((session) =>
      bookmarkedSessions.value.has(session.code),
    )
  }

  return filteredSessions
})

// Toggle bookmark
function toggleBookmark(sessionCode: string) {
  if (bookmarkedSessions.value.has(sessionCode)) {
    bookmarkedSessions.value.delete(sessionCode)
  } else {
    bookmarkedSessions.value.add(sessionCode)
  }
}

// Get sessions for a specific room
function getSessionsForRoom(roomId: number | string) {
  return displaySessions.value.filter((session) =>
    session.room?.id === roomId,
  )
}

// Scroll fade management
const {
  containerRef: scheduleContainerRef,
  leftFadeRef,
  rightFadeRef,
  scrolledToLeft,
  scrolledToRight,
} = useScrollFade()

const router = useRouter()

// Scroll position storage
const scrollPosition = useSessionStorage<{ x: number, y: number }>('session-scroll-position', { x: 0, y: 0 })

function handleOpenSession(sessionCode: string) {
  // Capture current scroll position before navigation
  if (scheduleContainerRef.value) {
    scrollPosition.value = {
      x: scheduleContainerRef.value.scrollLeft,
      y: scheduleContainerRef.value.scrollTop,
    }
  }

  const pathname = new URL(sessionCode, location.href).pathname
  router.go(pathname)
}

function handleCloseSession() {
  const pathname = new URL('.', location.href).pathname
  router.go(pathname)
}

// Restore scroll position on component mount (for page refreshes/direct links)
onMounted(() => {
  nextTick(() => {
    if (scheduleContainerRef.value && scrollPosition.value) {
      scheduleContainerRef.value.scrollLeft = scrollPosition.value.x
      scheduleContainerRef.value.scrollTop = scrollPosition.value.y
      // Clear the stored position after restoration
      // scrollPosition.value = null
    }
  })
})

const openedSession = computed(() => {
  if (props.sessionCode) {
    return props.submissions.find((session) => session.code === props.sessionCode) ?? null
  }

  return null
})
</script>

<template>
  <!-- make the main content show earlier -->
  <SessionModal
    :locale="locale"
    :session="openedSession"
    @close="handleCloseSession"
  />

  <div class="schedule-page">
    <!-- Date Selection -->
    <nav class="date-tab">
      <SessionDateButton
        :selected="selectedDate === 'Aug.9'"
        @click="selectedDate = 'Aug.9'"
      >
        Aug.9
      </SessionDateButton>
      <SessionDateButton
        :selected="selectedDate === 'Aug.10'"
        @click="selectedDate = 'Aug.10'"
      >
        Aug.10
      </SessionDateButton>
    </nav>

    <div class="toolbar">
      <div class="toolbar-start">
        <!--
        <CButton
          class="time-zone-btn"
          variant="secondary"
        >
          <template #icon>
            🌐
          </template>
          Time zone
        </CButton>

        <CButton variant="basic">
          <template #icon>
            👥
          </template>
          {{ messages[locale].community || 'Community' }}
        </CButton>

        <CButton variant="basic">
          <template #icon>
            🏷️
          </template>
          {{ messages[locale].tags || 'Tags' }}
        </CButton>

        <CIconButton variant="basic">
          🔍
        </CIconButton>
        -->
      </div>

      <div class="toolbar-end">
        <CMenuBar
          v-model="selectedView"
          :items="viewMenuItems"
        />

        <CIconButton variant="basic">
          <IconPhShareFat />
        </CIconButton>
      </div>
    </div>

    <!-- Schedule Container -->
    <div
      ref="scheduleContainerRef"
      class="schedule-container"
    >
      <!-- Room Headers -->
      <div class="room-headers">
        <div class="time-header" />
        <div
          v-for="room in rooms"
          :key="room.id"
          class="room-header"
        >
          {{ room.name }}
        </div>
      </div>

      <!-- Main Schedule Grid -->
      <div class="schedule-content">
        <!-- Time Column -->
        <div class="time-column">
          <div
            v-for="timeSlot in timeSlots"
            :key="timeSlot"
            class="time-slot"
          >
            {{ timeSlot }}
          </div>
        </div>

        <!-- Sessions Area -->
        <div class="sessions-area">
          <!-- Grid Lines -->
          <div class="grid-lines">
            <div
              v-for="(_, index) in timeSlots"
              :key="`line-${index}`"
              class="grid-line"
              :style="{ top: `${index * TIME_SLOT_HEIGHT}px` }"
            />
          </div>

          <!-- Room Columns -->
          <div class="room-columns">
            <div
              v-for="(room, roomIndex) in rooms"
              :key="room.id"
              class="room-column"
            >
              <!-- Vertical Separator -->
              <div
                v-if="roomIndex > 0"
                class="column-separator"
              />

              <!-- Session Cards for this room -->
              <div
                v-for="session in getSessionsForRoom(room.id)"
                :key="session.code"
                class="session-card"
                :style="layout.getSessionStyle(session.code)"
                @click.prevent="handleOpenSession(session.code)"
              >
                <CCard
                  :bookmarked="bookmarkedSessions.has(session.code)"
                  :end-at="session.end"
                  :height-factor="layout.getHeightFactor(session.code)"
                  :speaker="session.speakers?.map(s => s.name).join(', ') || 'TBD'"
                  :start-at="session.start"
                  :status="openedSession?.code === session.code ? 'active' : 'default'"
                  :tag-text="session.track?.name || messages[locale].mainTrack"
                  :title="session.title"
                  @bookmark="toggleBookmark(session.code)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 視覺引導淡出遮罩（左側） -->
      <div
        v-show="!scrolledToLeft"
        ref="leftFadeRef"
        class="scroll-left-fade"
      />
      <!-- 視覺引導淡出遮罩（右側） -->
      <div
        v-show="!scrolledToRight"
        ref="rightFadeRef"
        class="scroll-right-fade"
      />
    </div>
  </div>
</template>

<style scoped>
.schedule-page {
  --date-tab-height: 3rem;
  --controls-height: 5rem;

  width: 100%;
  min-width: 100%;
  padding: 18px 32px;
  height: calc(100vh - var(--vp-nav-height));
}

.date-tab {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  font-family: Inter, sans-serif;
  color: #fff;
  height: var(--date-tab-height);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  height: var(--controls-height);

  @media (max-width: 500px) {
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  > .toolbar-start {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  > .toolbar-end {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.time-zone-btn {
  border: 1px solid var(--color-gray-300);
}

.schedule-container {
  border: 1px solid var(--color-gray-400);
  border-radius: 12px;
  overflow-x: auto;
  overflow-y: auto;
  width: 100%;
  height: calc(100% - var(--date-tab-height) - var(--controls-height));
  position: relative;
}

.room-headers {
  display: flex;
  background: var(--color-gray-50);
  border-bottom: 1px solid var(--color-gray-200);
  position: sticky;
  top: 0;
  z-index: 10;
  width: max-content;
}

.time-header {
  width: 68px;
  border-right: 1px solid var(--color-gray-200);
}

.room-header {
  flex: 1;
  min-width: 320px;
  padding: 12px;
  text-align: center;
  font-family: 'PingFang TC', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary-400);
  letter-spacing: 0.54px;
}

.schedule-content {
  display: flex;
  position: relative;
  min-height: calc(300px * 11);
  min-width: 900px;
}

.time-column {
  width: 68px;
  background: var(--color-gray-50);
  border-right: 1px solid var(--color-gray-200);
  position: relative;
}

.time-slot {
  width: 68px;
  height: 400px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-right: 12px;
  padding-top: 4px;
  font-family: 'PingFang TC', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-gray-400);
  position: relative;
}

.sessions-area {
  flex: 1;
  position: relative;
  min-height: calc(300px * 11);
}

.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: color-mix(in srgb, var(--color-gray-200) 50%, transparent);
}

.room-columns {
  display: flex;
  height: 100%;
  position: relative;
  z-index: 2;
  min-width: 900px;
}

.room-column {
  flex: 1;
  min-width: 320px;
  position: relative;
  padding: 8px;
}

.column-separator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: color-mix(in srgb, var(--color-gray-200) 50%, transparent);
  z-index: 1;
}

.session-card {
  position: absolute;
  left: 8px;
  right: 8px;
  cursor: pointer;
  z-index: 3;
  transition: transform 0.2s ease;
}

a.session-card {
  text-decoration: none;
}

.session-card:hover {
  transform: translateY(-2px);
  z-index: 4;
}

.scroll-right-fade {
  position: absolute;
  top: 0;
  right: 0;
  width: 48px;
  height: 100%;
  pointer-events: none;
  z-index: 20;
  background: linear-gradient(to right, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.85) 100%);
}

.scroll-left-fade {
  position: absolute;
  top: 0;
  left: 0;
  width: 48px;
  height: 100%;
  pointer-events: none;
  z-index: 20;
  background: linear-gradient(to left, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.85) 100%);
}
</style>
