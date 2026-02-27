<template>
  <GlassCard :class="className">
    <div class="p-6">
      <!-- Icon and Label Row -->
      <div class="flex items-center gap-3 mb-4">
        <div 
          :class="[
            'p-2 rounded-lg',
            `bg-${iconColor}-500/20 text-${iconColor}-400`
          ]"
        >
          <component :is="icon" class="h-5 w-5" />
        </div>
        <span class="text-sm font-medium text-muted-foreground">{{ label }}</span>
      </div>
      
      <!-- Value and Trend -->
      <div class="flex items-end justify-between">
        <div>
          <div class="text-2xl font-bold text-foreground">{{ value }}</div>
          <div v-if="subtext" class="text-sm text-muted-foreground mt-1">{{ subtext }}</div>
        </div>
        
        <!-- Trend Indicator -->
        <div v-if="trend" class="flex items-center gap-1 text-sm">
          <component 
            :is="trend.direction === 'up' ? ChevronUp : ChevronDown" 
            :class="[
              'h-4 w-4',
              trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
            ]"
          />
          <span 
            :class="[
              'font-medium',
              trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
            ]"
          >
            {{ trend.value }}
          </span>
        </div>
      </div>
    </div>
  </GlassCard>
</template>

<script setup lang="ts">
import { Component } from 'vue'
import { ChevronUp, ChevronDown } from 'lucide-vue-next'
import GlassCard from './GlassCard.vue'

interface TrendData {
  direction: 'up' | 'down'
  value: string
}

interface Props {
  icon: Component
  iconColor: string
  label: string
  value: string
  subtext?: string
  trend?: TrendData
  className?: string
}

withDefaults(defineProps<Props>(), {
  className: ''
})
</script>