<template>
  <div class="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
    <!-- Logo Section -->
    <div class="p-6 border-b border-sidebar-border">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Shield class="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 class="text-lg font-bold text-sidebar-foreground">Teletrac Fuel</h1>
          <p class="text-xs text-sidebar-foreground/60">Fleet Management</p>
        </div>
      </div>
    </div>
    
    <!-- Navigation Menu -->
    <nav class="flex-1 p-4 space-y-2">
      <SidebarItem
        v-for="item in navigationItems"
        :key="item.name"
        :to="item.to"
        :icon="item.icon"
        :label="item.label"
        :badge="item.badge"
      />
    </nav>
    
    <!-- Footer -->
    <div class="p-4 border-t border-sidebar-border">
      <div class="text-xs text-sidebar-foreground/60 text-center">
        © 2025 Teletrac Fuel
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { 
  BarChart3, 
  Car, 
  AlertTriangle, 
  FileText, 
  Settings, 
  Shield,
  PieChart
} from 'lucide-vue-next'
import SidebarItem from './SidebarItem.vue'

const route = useRoute()

const navigationItems = computed(() => [
  {
    name: 'dashboard',
    to: '/',
    icon: BarChart3,
    label: 'Dashboard',
    badge: null
  },
  {
    name: 'analytics', 
    to: '/analytics',
    icon: PieChart,
    label: 'Analytics',
    badge: null
  },
  {
    name: 'fleet-assets',
    to: '/fleet-assets',
    icon: Car,
    label: 'Fleet Assets',
    badge: null
  },
  {
    name: 'alerts',
    to: '/alerts',
    icon: AlertTriangle,
    label: 'Alerts',
    badge: '3'
  },
  {
    name: 'reports',
    to: '/reports',
    icon: FileText,
    label: 'Reports',
    badge: null
  },
  {
    name: 'settings',
    to: '/settings',
    icon: Settings,
    label: 'Settings',
    badge: null
  }
])
</script>
