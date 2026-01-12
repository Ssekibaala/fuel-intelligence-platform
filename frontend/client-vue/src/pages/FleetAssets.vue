<template>
  <div class="h-full overflow-auto p-6 space-y-6">
    <!-- Page Header with Controls -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-foreground">Fleet Assets</h1>
        <p class="text-sm text-muted-foreground">Asset Management & Performance Monitoring</p>
      </div>
      
      <div class="flex items-center gap-4">
        <!-- View Mode Toggle -->
        <div class="flex bg-muted rounded-lg p-1">
          <button
            @click="viewMode = 'table'"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-all duration-200',
              viewMode === 'table' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            ]"
            data-testid="button-view-table"
          >
            Table View
          </button>
          <button
            @click="viewMode = 'focused'"
            :class="[
              'px-3 py-1 text-sm rounded-md transition-all duration-200',
              viewMode === 'focused' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            ]"
            data-testid="button-view-focused"
          >
            Focused View
          </button>
        </div>
        
        <!-- Asset Filter -->
        <select
          v-model="selectedAsset"
          class="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-primary"
          data-testid="select-asset-filter"
        >
          <option value="">All Assets</option>
          <option value="SEM-12346">SEM-12346 — Delivery Truck</option>
          <option value="FLT-78901">FLT-78901 — Service Van</option>
          <option value="TRK-45612">TRK-45612 — Cargo Truck</option>
        </select>
      </div>
    </div>

    <!-- Table View -->
    <div v-if="viewMode === 'table'">
      <GlassCard>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Asset ID</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Driver</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Fuel Level</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Efficiency</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Distance</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Engine Hours</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Theft Risk</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Maintenance</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="asset in assets"
                  :key="asset.id"
                  class="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  :data-testid="`row-asset-${asset.id}`"
                >
                  <td class="py-3 px-4">
                    <div class="font-medium text-foreground">{{ asset.id }}</div>
                    <div class="text-xs text-muted-foreground">{{ asset.type }}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="text-foreground">{{ asset.driver }}</div>
                  </td>
                  <td class="py-3 px-4">
                    <span 
                      :class="[
                        'px-2 py-1 rounded-full text-xs font-medium',
                        asset.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' :
                        asset.status === 'Idle' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      ]"
                    >
                      {{ asset.status }}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <div class="w-16 bg-muted rounded-full h-2">
                        <div 
                          :class="[
                            'h-2 rounded-full',
                            asset.fuelLevel >= 70 ? 'bg-emerald-500' :
                            asset.fuelLevel >= 30 ? 'bg-yellow-500' : 'bg-red-500'
                          ]"
                          :style="{ width: `${asset.fuelLevel}%` }"
                        ></div>
                      </div>
                      <span class="text-xs text-muted-foreground">{{ asset.fuelLevel }}%</span>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="text-foreground">{{ asset.efficiency }}</div>
                    <div class="text-xs text-muted-foreground">L/100km</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="text-foreground">{{ asset.distance }}</div>
                    <div class="text-xs text-muted-foreground">Today</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="text-foreground">{{ asset.engineHours }}</div>
                  </td>
                  <td class="py-3 px-4">
                    <span 
                      :class="[
                        'px-2 py-1 rounded-full text-xs font-medium',
                        asset.theftRisk === 'Low' ? 'bg-emerald-500/20 text-emerald-400' :
                        asset.theftRisk === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      ]"
                    >
                      {{ asset.theftRisk }}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <div class="text-foreground">{{ asset.nextMaintenance }}</div>
                    <div class="text-xs text-muted-foreground">days</div>
                  </td>
                  <td class="py-3 px-4">
                    <button
                      @click="selectedAssetForFocus = asset.id; viewMode = 'focused'"
                      class="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs hover-elevate transition-all duration-200"
                      :data-testid="`button-view-${asset.id}`"
                    >
                      View
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>
    </div>

    <!-- Focused View (Asset Summary) -->
    <div v-else-if="viewMode === 'focused'" class="space-y-6">
      <!-- Asset Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">{{ focusedAsset?.id || 'SEM-12346' }}</h2>
          <p class="text-muted-foreground">{{ focusedAsset?.type || 'Delivery Truck' }} • Driver: {{ focusedAsset?.driver || 'John Smith' }}</p>
        </div>
        <button
          @click="viewMode = 'table'"
          class="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover-elevate transition-all duration-200"
          data-testid="button-back-to-table"
        >
          ← Back to Table
        </button>
      </div>

      <!-- Asset Audit Cards - 2 rows of 3 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          :icon="Calendar"
          icon-color="blue"
          label="Working Days"
          value="22 Days"
          subtext="This month"
        />
        <KPICard
          :icon="ParkingCircle"
          icon-color="yellow"
          label="Parking Days"
          value="8 Days"
          subtext="Idle time"
        />
        <KPICard
          :icon="Clock"
          icon-color="green"
          label="Total Engine Hours"
          value="342 Hr"
          subtext="This period"
        />
        <KPICard
          :icon="Fuel"
          icon-color="orange"
          label="Total Refills"
          value="15 Refills"
          subtext="847L total"
        />
        <KPICard
          :icon="TrendingDown"
          icon-color="red"
          label="Total Fuel Used"
          value="823 L"
          subtext="Efficiency: 12.3L/100km"
        />
        <KPICard
          :icon="Shield"
          icon-color="red"
          label="Theft Incidents"
          value="2 Events"
          subtext="24L estimated loss"
        />
      </div>

      <!-- Fuel Levels VS Time Graph -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-6">Fuel Levels VS Date and Time</h3>
          
          <!-- Simplified time-series visualization -->
          <div class="h-64 bg-muted/20 rounded-lg p-4 relative">
            <div class="absolute inset-4 border-l border-b border-border">
              <!-- Y-axis labels -->
              <div class="absolute -left-8 top-0 text-xs text-muted-foreground">100L</div>
              <div class="absolute -left-8 top-1/2 text-xs text-muted-foreground">50L</div>
              <div class="absolute -left-8 bottom-0 text-xs text-muted-foreground">0L</div>
              
              <!-- X-axis labels -->
              <div class="absolute -bottom-6 left-0 text-xs text-muted-foreground">Mon</div>
              <div class="absolute -bottom-6 left-1/4 text-xs text-muted-foreground">Tue</div>
              <div class="absolute -bottom-6 left-2/4 text-xs text-muted-foreground">Wed</div>
              <div class="absolute -bottom-6 left-3/4 text-xs text-muted-foreground">Thu</div>
              <div class="absolute -bottom-6 right-0 text-xs text-muted-foreground">Fri</div>
              
              <!-- Fuel level line -->
              <svg class="w-full h-full" viewBox="0 0 400 200">
                <polyline
                  points="0,60 80,45 160,120 240,30 320,85 400,70"
                  fill="none"
                  stroke="rgb(59 130 246)"
                  stroke-width="2"
                  class="drop-shadow-sm"
                />
                <!-- Refill points -->
                <circle cx="160" cy="120" r="4" fill="rgb(34 197 94)" />
                <circle cx="240" cy="30" r="4" fill="rgb(34 197 94)" />
              </svg>
            </div>
          </div>
          
          <div class="mt-4 flex items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span class="text-muted-foreground">Fuel Level</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span class="text-muted-foreground">Refill Events</span>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Expanded Cost Analysis -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-6">Cost Analysis</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div class="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <span class="text-muted-foreground">Fuel Cost</span>
                <span class="font-semibold text-foreground">KES 98,760</span>
              </div>
              <div class="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <span class="text-muted-foreground">Est. Operating Cost</span>
                <span class="font-semibold text-foreground">KES 45,320</span>
              </div>
              <div class="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                <span class="text-primary font-medium">Total Cost of Ownership (TCO)</span>
                <span class="font-bold text-primary">KES 144,080</span>
              </div>
            </div>
            
            <div class="space-y-4">
              <div class="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <span class="text-muted-foreground">Distance Covered</span>
                <span class="font-semibold text-foreground">2,847 km</span>
              </div>
              <div class="flex items-center justify-between p-4 bg-accent/10 rounded-lg">
                <span class="text-accent-foreground font-medium">Cost Per Kilometer</span>
                <span class="font-bold text-accent-foreground">KES 50.60/km</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <!-- Daily Trips Table -->
      <GlassCard>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-6">Daily Trips</h3>
          
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Distance</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Fuel Used</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Efficiency</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground">Cost Per Trip</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trip in dailyTrips" :key="trip.date" class="border-b border-border/50">
                  <td class="py-3 px-4 text-foreground">{{ trip.date }}</td>
                  <td class="py-3 px-4 text-foreground">{{ trip.distance }}</td>
                  <td class="py-3 px-4 text-foreground">{{ trip.fuelUsed }}</td>
                  <td class="py-3 px-4">
                    <span 
                      :class="[
                        'px-2 py-1 rounded-full text-xs font-medium',
                        trip.efficiencyRating === 'Excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                        trip.efficiencyRating === 'Good' ? 'bg-blue-500/20 text-blue-400' :
                        trip.efficiencyRating === 'Average' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      ]"
                    >
                      {{ trip.efficiencyRating }}
                    </span>
                  </td>
                  <td class="py-3 px-4 font-medium text-foreground">{{ trip.costPerTrip }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Calendar, ParkingCircle, Clock, Fuel, TrendingDown, Shield } from 'lucide-vue-next'
import GlassCard from '@/components/GlassCard.vue'
import KPICard from '@/components/KPICard.vue'

const viewMode = ref('table')
const selectedAsset = ref('')
const selectedAssetForFocus = ref('SEM-12346')

// Mock asset data
const assets = ref([
  {
    id: 'SEM-12346',
    type: 'Delivery Truck',
    driver: 'John Smith',
    status: 'Active',
    fuelLevel: 78,
    efficiency: '12.3',
    distance: '247 km',
    engineHours: '8.5 Hr',
    theftRisk: 'Low',
    nextMaintenance: '15'
  },
  {
    id: 'FLT-78901',
    type: 'Service Van',
    driver: 'Sarah Johnson', 
    status: 'Idle',
    fuelLevel: 45,
    efficiency: '10.8',
    distance: '156 km',
    engineHours: '6.2 Hr',
    theftRisk: 'Medium',
    nextMaintenance: '7'
  },
  {
    id: 'TRK-45612',
    type: 'Cargo Truck',
    driver: 'Michael Brown',
    status: 'Maintenance',
    fuelLevel: 23,
    efficiency: '15.1',
    distance: '89 km',
    engineHours: '4.1 Hr',
    theftRisk: 'High',
    nextMaintenance: '0'
  }
])

const focusedAsset = computed(() => {
  return assets.value.find(asset => asset.id === selectedAssetForFocus.value)
})

const dailyTrips = ref([
  {
    date: '2025-01-27',
    distance: '245 km',
    fuelUsed: '32.1 L',
    efficiencyRating: 'Good',
    costPerTrip: 'KES 3,852'
  },
  {
    date: '2025-01-26',
    distance: '189 km',
    fuelUsed: '28.7 L',
    efficiencyRating: 'Excellent',
    costPerTrip: 'KES 3,444'
  },
  {
    date: '2025-01-25',
    distance: '312 km',
    fuelUsed: '45.2 L',
    efficiencyRating: 'Average',
    costPerTrip: 'KES 5,424'
  },
  {
    date: '2025-01-24',
    distance: '156 km',
    fuelUsed: '19.8 L',
    efficiencyRating: 'Excellent',
    costPerTrip: 'KES 2,376'
  }
])
</script>