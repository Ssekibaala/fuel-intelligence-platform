<template>
  <router-link
    :to="to"
    :class="[
      'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
      'hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      isActive 
        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' 
        : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
    ]"
    :data-testid="`nav-${to.replace('/', '') || 'dashboard'}`"
  >
    <component :is="icon" class="h-5 w-5 flex-shrink-0" />
    <span class="flex-1">{{ label }}</span>
    <span 
      v-if="badge" 
      class="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-medium"
    >
      {{ badge }}
    </span>
  </router-link>
</template>

<script setup lang="ts">
import { computed, Component } from 'vue'
import { useRoute } from 'vue-router'

interface Props {
  to: string
  icon: Component
  label: string
  badge?: string | null
}

const props = defineProps<Props>()
const route = useRoute()

const isActive = computed(() => {
  if (props.to === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(props.to)
})
</script>