<template>
  <div class="h-screen w-full flex bg-background text-foreground">
    <!-- Liquid Background -->
    <LiquidBackground />
    
    <!-- Sidebar -->
    <Sidebar />
    
    <!-- Main Content Area -->
    <div class="flex flex-col flex-1 relative">
      <!-- Header -->
      <Header />
      
      <!-- Page Content -->
      <main class="flex-1 overflow-hidden">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import LiquidBackground from './components/LiquidBackground.vue'
import Sidebar from './components/Sidebar.vue'
import Header from './components/Header.vue'

onMounted(() => {
  // Apply dark mode by default
  document.documentElement.classList.add('dark')
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>