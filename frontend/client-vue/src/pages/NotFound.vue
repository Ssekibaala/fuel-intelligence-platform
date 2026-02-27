<template>
  <div class="h-full flex items-center justify-center">
    <GlassCard className="max-w-md mx-auto text-center">
      <div class="p-8">
        <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle class="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 class="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
        <p class="text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <router-link
          to="/"
          class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover-elevate transition-all duration-200"
        >
          ← Back to Dashboard
        </router-link>
      </div>
    </GlassCard>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import GlassCard from '@/components/GlassCard.vue'
</script>