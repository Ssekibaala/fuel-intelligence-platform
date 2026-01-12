<template>
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <div class="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-background to-indigo-950/20"></div>
    
    <!-- Liquid Orbs -->
    <div class="absolute top-10 left-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-liquid-flow"></div>
    <div class="absolute top-1/2 right-20 w-64 h-64 bg-indigo-500/15 rounded-full blur-2xl animate-liquid-flow" style="animation-delay: -5s;"></div>
    <div class="absolute bottom-20 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-liquid-flow" style="animation-delay: -10s;"></div>
    <div class="absolute top-1/4 right-1/3 w-48 h-48 bg-purple-500/12 rounded-full blur-2xl animate-liquid-flow" style="animation-delay: -15s;"></div>
    
    <!-- Subtle Grid Pattern -->
    <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30"></div>
  </div>
</template>

<script setup lang="ts">
// No script needed for this purely visual component
</script>

<style scoped>
/* Component-specific styles if needed */
</style>