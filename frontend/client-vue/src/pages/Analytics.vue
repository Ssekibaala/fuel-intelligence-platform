<template>
  <div class="h-full overflow-auto p-6 space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-foreground">Analytics Center</h1>
        <p class="text-sm text-muted-foreground">Statistical Analysis & Performance Insights</p>
      </div>
      
      <div class="flex items-center gap-4">
        <!-- Time Range -->
        <select
          v-model="timeRange"
          class="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary"
          data-testid="select-time-range"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="1y">Last Year</option>
        </select>
        
        <!-- Export Button -->
        <button
          @click="exportData"
          class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover-elevate transition-all duration-200"
          data-testid="button-export-analytics"
        >
          Export Data
        </button>
      </div>
    </div>

    <!-- Fleet Efficiency Distribution -->
    <GlassCard>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-6">Fleet Efficiency Distribution (L/100km)</h3>
        
        <!-- Histogram-style visualization -->
        <div class="grid grid-cols-8 gap-2 h-48 items-end mb-4">
          <div v-for="(bar, index) in efficiencyDistribution" :key="index" class="flex flex-col items-center">
            <div 
              :class="[
                'w-full rounded-t-lg transition-all duration-500',
                bar.category === 'excellent' ? 'bg-emerald-500' :
                bar.category === 'good' ? 'bg-blue-500' :
                bar.category === 'average' ? 'bg-yellow-500' : 'bg-red-500'
              ]"
              :style="{ height: `${bar.height}%` }"
            ></div>
            <div class="text-xs text-muted-foreground mt-2">{{ bar.range }}</div>
            <div class="text-xs font-medium text-foreground">{{ bar.count }}</div>
          </div>
        </div>
        
        <!-- Legend -->
        <div class="flex items-center gap-6 text-sm">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-emerald-500 rounded-full"></div>
            <span class="text-muted-foreground">Excellent (< 10 L/100km)</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span class="text-muted-foreground">Good (10-12 L/100km)</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span class="text-muted-foreground">Average (12-15 L/100km)</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-red-500 rounded-full"></div>
            <span class="text-muted-foreground">Poor (> 15 L/100km)</span>
          </div>
        </div>
      </div>
    </GlassCard>

    <!-- Consumption vs External Factors -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-6">Consumption vs External Factors</h3>
          
          <!-- Scatter plot simulation -->
          <div class="h-64 bg-muted/20 rounded-lg p-4 relative">
            <div class="absolute inset-4 border-l border-b border-border">
              <!-- Y-axis: Fuel Consumption -->
              <div class="absolute -left-16 top-0 text-xs text-muted-foreground">20 L/100km</div>
              <div class="absolute -left-16 top-1/2 text-xs text-muted-foreground">15 L/100km</div>
              <div class="absolute -left-16 bottom-0 text-xs text-muted-foreground">10 L/100km</div>
              
              <!-- X-axis: Temperature -->
              <div class="absolute -bottom-6 left-0 text-xs text-muted-foreground">-10°C</div>
              <div class="absolute -bottom-6 left-1/2 text-xs text-muted-foreground">15°C</div>
              <div class="absolute -bottom-6 right-0 text-xs text-muted-foreground">40°C</div>
              
              <!-- Scatter points -->
              <div class="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div class="absolute top-1/3 left-1/3 w-2 h-2 bg-emerald-500 rounded-full"></div>
              <div class="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-500 rounded-full"></div>
              <div class="absolute top-2/3 left-2/3 w-2 h-2 bg-red-500 rounded-full"></div>
              <div class="absolute top-3/4 left-3/4 w-2 h-2 bg-orange-500 rounded-full"></div>
            </div>
          </div>
          
          <div class="mt-4 space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Correlation (Temperature)</span>
              <span class="font-medium text-foreground">+0.73</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Weather Impact</span>
              <span class="font-medium text-orange-400">+18% in extreme conditions</span>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Idle Time Impact Analysis -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-6">Idle Time Impact Analysis</h3>
          
          <!-- Stacked bar chart for idle time costs -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Vehicle 1 (SEM-12346)</span>
              <span class="text-sm font-medium text-foreground">KES 2,450</span>
            </div>
            <div class="w-full bg-muted rounded-full h-4 overflow-hidden">
              <div class="h-full flex">
                <div class="bg-emerald-500 flex-1"></div>
                <div class="bg-yellow-500" style="flex: 0.3;"></div>
                <div class="bg-red-500" style="flex: 0.2;"></div>
              </div>
            </div>
            
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Vehicle 2 (FLT-78901)</span>
              <span class="text-sm font-medium text-foreground">KES 1,890</span>
            </div>
            <div class="w-full bg-muted rounded-full h-4 overflow-hidden">
              <div class="h-full flex">
                <div class="bg-emerald-500" style="flex: 0.7;"></div>
                <div class="bg-yellow-500" style="flex: 0.25;"></div>
                <div class="bg-red-500" style="flex: 0.05;"></div>
              </div>
            </div>
            
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">Vehicle 3 (TRK-45612)</span>
              <span class="text-sm font-medium text-foreground">KES 3,120</span>
            </div>
            <div class="w-full bg-muted rounded-full h-4 overflow-hidden">
              <div class="h-full flex">
                <div class="bg-emerald-500" style="flex: 0.5;"></div>
                <div class="bg-yellow-500" style="flex: 0.3;"></div>
                <div class="bg-red-500" style="flex: 0.2;"></div>
              </div>
            </div>
          </div>
          
          <!-- Legend -->
          <div class="mt-6 flex items-center gap-4 text-xs">
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span class="text-muted-foreground">Active</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span class="text-muted-foreground">Normal Idle</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 bg-red-500 rounded-full"></div>
              <span class="text-muted-foreground">Excessive Idle</span>
            </div>
          </div>
          
          <div class="mt-4 p-3 bg-destructive/10 rounded-lg">
            <div class="text-sm font-medium text-destructive">Total Idle Cost</div>
            <div class="text-lg font-bold text-destructive">KES 7,460</div>
            <div class="text-xs text-muted-foreground">This month</div>
          </div>
        </div>
      </GlassCard>
    </div>

    <!-- Theft Mitigation ROI -->
    <GlassCard>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-6">Theft Mitigation ROI</h3>
        
        <!-- Line chart showing mitigated loss over time -->
        <div class="h-64 bg-muted/20 rounded-lg p-4 relative">
          <div class="absolute inset-4 border-l border-b border-border">
            <!-- Y-axis labels -->
            <div class="absolute -left-12 top-0 text-xs text-muted-foreground">KES 50k</div>
            <div class="absolute -left-12 top-1/2 text-xs text-muted-foreground">KES 25k</div>
            <div class="absolute -left-12 bottom-0 text-xs text-muted-foreground">KES 0</div>
            
            <!-- X-axis labels -->
            <div class="absolute -bottom-6 left-0 text-xs text-muted-foreground">Jan</div>
            <div class="absolute -bottom-6 left-1/4 text-xs text-muted-foreground">Feb</div>
            <div class="absolute -bottom-6 left-2/4 text-xs text-muted-foreground">Mar</div>
            <div class="absolute -bottom-6 left-3/4 text-xs text-muted-foreground">Apr</div>
            <div class="absolute -bottom-6 right-0 text-xs text-muted-foreground">May</div>
            
            <!-- ROI trend line -->
            <svg class="w-full h-full" viewBox="0 0 400 200">
              <!-- Mitigated Loss -->
              <polyline
                points="0,120 80,100 160,80 240,60 320,40 400,35"
                fill="none"
                stroke="rgb(34 197 94)"
                stroke-width="3"
                class="drop-shadow-sm"
              />
              <!-- System Cost -->
              <polyline
                points="0,180 80,180 160,180 240,180 320,180 400,180"
                fill="none"
                stroke="rgb(239 68 68)"
                stroke-width="2"
                stroke-dasharray="5,5"
              />
            </svg>
          </div>
        </div>
        
        <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center p-4 bg-emerald-500/10 rounded-lg">
            <div class="text-sm text-muted-foreground">Total Prevented Loss</div>
            <div class="text-xl font-bold text-emerald-400">KES 187,500</div>
            <div class="text-xs text-muted-foreground">5 months</div>
          </div>
          <div class="text-center p-4 bg-red-500/10 rounded-lg">
            <div class="text-sm text-muted-foreground">System Investment</div>
            <div class="text-xl font-bold text-red-400">KES 45,000</div>
            <div class="text-xs text-muted-foreground">Installation + Monthly</div>
          </div>
          <div class="text-center p-4 bg-primary/10 rounded-lg">
            <div class="text-sm text-muted-foreground">ROI</div>
            <div class="text-xl font-bold text-primary">317%</div>
            <div class="text-xs text-muted-foreground">Return on Investment</div>
          </div>
        </div>
        
        <!-- Legend -->
        <div class="mt-6 flex items-center gap-6 text-sm">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-emerald-500 rounded-full"></div>
            <span class="text-muted-foreground">Mitigated Loss</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-1 bg-red-500 border border-red-500" style="border-style: dashed;"></div>
            <span class="text-muted-foreground">System Cost</span>
          </div>
        </div>
      </div>
    </GlassCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GlassCard from '@/components/GlassCard.vue'

const timeRange = ref('30d')

// Mock data for efficiency distribution
const efficiencyDistribution = ref([
  { range: '8-9', count: 2, height: 45, category: 'excellent' },
  { range: '9-10', count: 5, height: 85, category: 'excellent' },
  { range: '10-11', count: 8, height: 100, category: 'good' },
  { range: '11-12', count: 6, height: 75, category: 'good' },
  { range: '12-13', count: 4, height: 60, category: 'average' },
  { range: '13-14', count: 3, height: 45, category: 'average' },
  { range: '14-15', count: 2, height: 35, category: 'poor' },
  { range: '15+', count: 1, height: 20, category: 'poor' }
])

const exportData = () => {
  // Export functionality
  console.log('Exporting analytics data...')
}
</script>