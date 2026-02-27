<template>
  <div class="h-full overflow-auto p-6 space-y-6">
    <!-- Page Header with Controls -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Fleet Health Score - Minimized -->
        <div class="flex items-center gap-3">
          <div class="relative w-16 h-16">
            <svg class="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--muted))"
                stroke-width="2"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                :stroke="healthScore >= 80 ? 'rgb(34 197 94)' : healthScore >= 60 ? 'rgb(245 158 11)' : 'rgb(239 68 68)'"
                stroke-width="2"
                stroke-linecap="round"
                :stroke-dasharray="`${healthScore}, 100`"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-sm font-bold text-foreground">{{ healthScore }}</span>
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-foreground">Fleet Health</div>
            <div class="text-xs text-muted-foreground">98.7% Confidence</div>
          </div>
        </div>
      </div>
      
      <!-- Page Controls -->
      <template v-slot:controls>
        <div class="flex items-center gap-4">
          <!-- Asset Filter -->
          <select
            v-model="selectedAsset"
            class="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary"
            data-testid="select-asset-filter"
          >
            <option value="">All Vehicles</option>
            <option value="SEM-12346">SEM-12346 — Delivery Truck</option>
            <option value="FLT-78901">FLT-78901 — Service Van</option>
            <option value="TRK-45612">TRK-45612 — Cargo Truck</option>
          </select>
          
          <!-- Date Range -->
          <div class="flex items-center gap-2">
            <input
              v-model="dateRange.from"
              type="date"
              class="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary"
              data-testid="input-date-from"
            />
            <span class="text-muted-foreground">to</span>
            <input
              v-model="dateRange.to"
              type="date"
              class="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary"
              data-testid="input-date-to"
            />
          </div>
          
          <!-- Period Toggle -->
          <div class="flex bg-muted rounded-lg p-1">
            <button
              @click="periodToggle = 'daily'"
              :class="[
                'px-3 py-1 text-sm rounded-md transition-all duration-200',
                periodToggle === 'daily' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              ]"
              data-testid="button-period-daily"
            >
              Daily
            </button>
            <button
              @click="periodToggle = 'weekly'"
              :class="[
                'px-3 py-1 text-sm rounded-md transition-all duration-200',
                periodToggle === 'weekly' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              ]"
              data-testid="button-period-weekly"
            >
              Weekly
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- KPI Cards Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KPICard
        :icon="Clock"
        icon-color="blue"
        label="Total Engine Hours"
        value="1,247 Hr"
        subtext="Est. Operating Cost: KES 353,664"
        :trend="{ direction: 'up', value: '7-day trend' }"
      />
      <KPICard
        :icon="MapPin"
        icon-color="blue"
        label="Total Distance"
        value="18,432 Km"
        subtext="7-day trend"
        :trend="{ direction: 'up', value: '5.2%' }"
      />
      <KPICard
        :icon="Fuel"
        icon-color="orange"
        label="Total Fuel Used"
        value="2,456 L"
        subtext="Total Fuel Cost: KES 294,720"
      />
      <KPICard
        :icon="Shield"
        icon-color="green"
        label="System Reliability"
        value="94%"
        subtext="Excellent Uptime Status"
        :trend="{ direction: 'up', value: '2.1%' }"
      />
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Fuel Used vs Refilled Bar Chart -->
      <GlassCard>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-semibold text-foreground">Fuel Analysis</h3>
              <p class="text-sm text-muted-foreground">Consumption vs Refill Patterns</p>
            </div>
          </div>
          
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Total Fuel Used</span>
              <span class="text-sm font-medium text-foreground">2,456 L</span>
            </div>
            <div class="w-full bg-muted rounded-full h-3">
              <div class="bg-red-500 h-3 rounded-full" style="width: 78%"></div>
            </div>
            
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Total Fuel Refilled</span>
              <span class="text-sm font-medium text-foreground">2,840 L</span>
            </div>
            <div class="w-full bg-muted rounded-full h-3">
              <div class="bg-emerald-500 h-3 rounded-full" style="width: 90%"></div>
            </div>
            
            <div class="pt-3 border-t border-border">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">Efficiency Surplus</span>
                <span class="text-sm font-medium text-emerald-400">+384 L</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Fleet Fuel Consumption Rate -->
      <GlassCard>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-semibold text-foreground">Fleet Fuel Consumption Rate</h3>
            </div>
            
            <!-- Unit Toggle L/Hr ↔ L/100km -->
            <div class="flex bg-muted rounded-lg p-1">
              <button
                @click="unitToggle = 'l-hr'"
                :class="[
                  'px-3 py-1 text-sm rounded-md transition-all duration-200',
                  unitToggle === 'l-hr' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                ]"
                data-testid="button-unit-l-hr"
              >
                L/Hr
              </button>
              <button
                @click="unitToggle = 'l-100km'"
                :class="[
                  'px-3 py-1 text-sm rounded-md transition-all duration-200',
                  unitToggle === 'l-100km' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                ]"
                data-testid="button-unit-l-100km"
              >
                L/100km
              </button>
            </div>
          </div>
          
          <!-- Simple Chart Visualization -->
          <div class="space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">{{ chartLabels[0] }}</span>
              <span class="font-medium">{{ getChartValue(0) }}</span>
            </div>
            <div class="w-full bg-muted rounded-full h-2">
              <div class="bg-chart-1 h-2 rounded-full" style="width: 65%"></div>
            </div>
            
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">{{ chartLabels[1] }}</span>
              <span class="font-medium">{{ getChartValue(1) }}</span>
            </div>
            <div class="w-full bg-muted rounded-full h-2">
              <div class="bg-chart-2 h-2 rounded-full" style="width: 45%"></div>
            </div>
            
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">{{ chartLabels[2] }}</span>
              <span class="font-medium">{{ getChartValue(2) }}</span>
            </div>
            <div class="w-full bg-muted rounded-full h-2">
              <div class="bg-chart-3 h-2 rounded-full" style="width: 55%"></div>
            </div>
            
            <div class="pt-3 border-t border-border">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Average</span>
                <span class="font-medium text-primary">{{ getAverageValue() }}</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>

    <!-- Bottom Row: 3-Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Optimization -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">Optimization</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg">
              <div>
                <div class="text-sm font-medium text-foreground">Route Efficiency</div>
                <div class="text-xs text-muted-foreground">+12% improvement</div>
              </div>
              <div class="text-emerald-400 font-semibold">+12%</div>
            </div>
            <div class="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg">
              <div>
                <div class="text-sm font-medium text-foreground">Fuel Economy</div>
                <div class="text-xs text-muted-foreground">Target: 8.5L/100km</div>
              </div>
              <div class="text-blue-400 font-semibold">8.2L</div>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Notifications -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">Notifications</h3>
          <div class="space-y-3">
            <div class="flex items-start gap-3 p-3 bg-red-500/10 rounded-lg">
              <AlertTriangle class="h-4 w-4 text-red-400 mt-0.5" />
              <div class="flex-1">
                <div class="text-sm font-medium text-foreground">Critical Alert</div>
                <div class="text-xs text-muted-foreground">SEM-12346 fuel theft detected</div>
              </div>
            </div>
            <div class="flex items-start gap-3 p-3 bg-yellow-500/10 rounded-lg">
              <AlertTriangle class="h-4 w-4 text-yellow-400 mt-0.5" />
              <div class="flex-1">
                <div class="text-sm font-medium text-foreground">Maintenance Due</div>
                <div class="text-xs text-muted-foreground">FLT-78901 service required</div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Diagnostics -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4">Diagnostics</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">System Status</span>
              <span class="text-sm font-medium text-emerald-400">Operational</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Data Sync</span>
              <span class="text-sm font-medium text-foreground">Real-time</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">GPS Accuracy</span>
              <span class="text-sm font-medium text-foreground">±2m</span>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Clock, MapPin, Fuel, Shield, AlertTriangle } from 'lucide-vue-next'
import GlassCard from '@/components/GlassCard.vue'
import KPICard from '@/components/KPICard.vue'

// Reactive state
const healthScore = ref(87)
const selectedAsset = ref('')
const dateRange = ref({
  from: '2025-06-24',
  to: '2025-08-07'
})
const periodToggle = ref('daily')
const unitToggle = ref('l-100km')

// Chart data
const chartLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const chartData = {
  'l-hr': [12.5, 8.7, 10.2, 9.8, 11.1, 7.3, 8.9],
  'l-100km': [15.1, 12.3, 14.8, 13.6, 16.2, 11.7, 13.4]
}

const getChartValue = (index: number) => {
  const values = chartData[unitToggle.value]
  return `${values[index]} ${unitToggle.value === 'l-hr' ? 'L/Hr' : 'L/100km'}`
}

const getAverageValue = () => {
  const values = chartData[unitToggle.value]
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length
  return `${avg.toFixed(1)} ${unitToggle.value === 'l-hr' ? 'L/Hr' : 'L/100km'}`
}
</script>