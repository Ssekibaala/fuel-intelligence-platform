import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

// Import pages
import Dashboard from './pages/Dashboard.vue'
import Analytics from './pages/Analytics.vue'
import FleetAssets from './pages/FleetAssets.vue'
import Alerts from './pages/Alerts.vue'
import Reports from './pages/Reports.vue'
import Settings from './pages/Settings.vue'
import NotFound from './pages/NotFound.vue'

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Dashboard', component: Dashboard },
    { path: '/analytics', name: 'Analytics', component: Analytics },
    { path: '/fleet-assets', name: 'FleetAssets', component: FleetAssets },
    { path: '/alerts', name: 'Alerts', component: Alerts },
    { path: '/reports', name: 'Reports', component: Reports },
    { path: '/settings', name: 'Settings', component: Settings },
    { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound }
  ]
})

// Create Pinia store
const pinia = createPinia()

// Create and mount app
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')