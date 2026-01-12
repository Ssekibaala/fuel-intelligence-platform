<template>
  <div 
    :class="[
      'bg-card/40 backdrop-blur-xl border border-card-border/30',
      'shadow-lg shadow-black/5 rounded-xl',
      hover ? 'hover-elevate transition-all duration-300' : '',
      className
    ]"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
interface Props {
  className?: string
  hover?: boolean
}

withDefaults(defineProps<Props>(), {
  className: '',
  hover: true
})
</script>

<style scoped>
/* Additional component-specific styles if needed */
</style>