<template>
  <header class="bg-card/30 backdrop-blur-sm border-b border-border px-6 py-4">
    <div class="flex items-center justify-between">
      <!-- Page Title and Breadcrumb -->
      <div class="flex flex-col">
        <h1 class="text-xl font-semibold text-foreground">{{ pageTitle }}</h1>
        <p v-if="pageSubtitle" class="text-sm text-muted-foreground">{{ pageSubtitle }}</p>
      </div>
      
      <!-- Page-specific controls will be injected here -->
      <div class="flex items-center gap-4">
        <slot name="controls" />
        
        <!-- Clock and Theme Toggle -->
        <div class="flex items-center gap-4 ml-4 pl-4 border-l border-border">
          <div class="text-sm text-muted-foreground font-mono">
            {{ currentTime }}
          </div>
          <button
            @click="toggleTheme"
            class="p-2 rounded-lg hover-elevate transition-all duration-200 text-muted-foreground hover:text-foreground"
            :data-testid="'button-theme-toggle'"
          >
            <Sun v-if="isDark" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Sun, Moon } from 'lucide-vue-next'

const route = useRoute()
const currentTime = ref('')
const isDark = ref(true)

// Page title mapping
const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/': { title: 'Teletrac Fuel', subtitle: 'Fleet Totals - Professional Data Density' },
  '/analytics': { title: 'Analytics Center', subtitle: 'Statistical Analysis & Performance Insights' },
  '/fleet-assets': { title: 'Fleet Assets', subtitle: 'Asset Management & Performance Monitoring' },
  '/alerts': { title: 'Alert Management', subtitle: 'Critical Notifications & System Status' },
  '/reports': { title: 'Reports Center', subtitle: 'Generate & Download Fleet Reports' },
  '/settings': { title: 'Settings', subtitle: 'System Configuration & Preferences' }
}

const pageTitle = computed(() => {
  const pageInfo = pageTitles[route.path]
  return pageInfo?.title || 'Teletrac Fuel'
})

const pageSubtitle = computed(() => {
  const pageInfo = pageTitles[route.path]
  return pageInfo?.subtitle
})

// Real-time clock
const updateTime = () => {
  currentTime.value = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const toggleTheme = () => {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

let timeInterval: number

onMounted(() => {
  updateTime()
  timeInterval = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})
</script>

