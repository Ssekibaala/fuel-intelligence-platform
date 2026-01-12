import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create Supabase client with service role (full access)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials in .env file!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Connected to Supabase successfully!');

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5002'],
  credentials: true
}));
app.use(express.json());

// ==================== HEALTH CHECK ====================
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    message: 'Fuel Platform Backend is running!',
    timestamp: new Date().toISOString(),
    supabase: 'Connected'
  });
});

// ==================== TEST DATABASE ====================
app.get('/api/test-db', async (req: Request, res: Response) => {
  try {
    // Test vehicles table
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('*')
      .limit(5);
    
    if (vehiclesError) throw vehiclesError;

    // Test fuel_events table
    const { data: fuelEvents, error: eventsError } = await supabase
      .from('fuel_events')
      .select('*')
      .limit(5);
    
    if (eventsError) throw eventsError;

    res.json({
      success: true,
      message: 'Database connection successful!',
      tables: {
        vehicles: vehicles?.length || 0,
        fuel_events: fuelEvents?.length || 0
      },
      sample: {
        vehicles: vehicles || [],
        fuelEvents: fuelEvents || []
      }
    });
  } catch (error: any) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message,
      tip: 'Make sure you ran the SQL migration in Supabase SQL Editor'
    });
  }
});

// ==================== VEHICLES API ====================
app.get('/api/vehicles', async (req: Request, res: Response) => {
  try {
    const { status, efficiency_rating, driver_name } = req.query;
    
    let query = supabase.from('vehicles').select('*');
    
    if (status) query = query.eq('status', status);
    if (efficiency_rating) query = query.eq('efficiency_rating', efficiency_rating);
    if (driver_name) query = query.ilike('driver_name', `%${driver_name}%`);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error: any) {
    console.error('Vehicles fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

app.get('/api/vehicles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Vehicle not found' });
    
    res.json(data);
  } catch (error: any) {
    console.error('Vehicle fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

app.post('/api/vehicles', async (req: Request, res: Response) => {
  try {
    const vehicle = req.body;
    
    // Required fields validation
    if (!vehicle.asset_id || !vehicle.vehicle_plate || !vehicle.driver_name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['asset_id', 'vehicle_plate', 'driver_name', 'status']
      });
    }
    
    const { data, error } = await supabase
      .from('vehicles')
      .insert([{
        asset_id: vehicle.asset_id,
        vehicle_plate: vehicle.vehicle_plate,
        driver_name: vehicle.driver_name,
        status: vehicle.status || 'Active',
        current_fuel_level: vehicle.current_fuel_level || 0,
        tank_capacity: vehicle.tank_capacity || 300,
        fuel_efficiency: vehicle.fuel_efficiency || 8.5,
        efficiency_rating: vehicle.efficiency_rating || 'Good',
        system_reliability: vehicle.system_reliability || 'Good'
      }])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      vehicle: data?.[0]
    });
  } catch (error: any) {
    console.error('Vehicle create error:', error);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

// ==================== FUEL EVENTS API ====================
app.get('/api/fuel-events', async (req: Request, res: Response) => {
  try {
    const { vehicle_id, event_type, start_date, end_date } = req.query;
    
    let query = supabase
      .from('fuel_events')
      .select('*, vehicles(asset_id, vehicle_plate, driver_name)')
      .order('event_timestamp', { ascending: false });
    
    if (vehicle_id) query = query.eq('vehicle_id', vehicle_id);
    if (event_type) query = query.eq('event_type', event_type);
    if (start_date) query = query.gte('event_timestamp', start_date);
    if (end_date) query = query.lte('event_timestamp', end_date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error: any) {
    console.error('Fuel events fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch fuel events' });
  }
});

app.post('/api/fuel-events', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    if (!event.vehicle_id || !event.event_type || !event.volume_liters) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['vehicle_id', 'event_type', 'volume_liters']
      });
    }
    
    const { data, error } = await supabase
      .from('fuel_events')
      .insert([{
        vehicle_id: event.vehicle_id,
        event_type: event.event_type,
        volume_liters: event.volume_liters,
        cost_kes: event.cost_kes,
        cost_ugx: event.cost_ugx,
        location: event.location,
        notes: event.notes,
        event_timestamp: event.event_timestamp || new Date().toISOString()
      }])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Fuel event recorded successfully',
      event: data?.[0]
    });
  } catch (error: any) {
    console.error('Fuel event create error:', error);
    res.status(500).json({ error: 'Failed to record fuel event' });
  }
});

// ==================== DASHBOARD API ====================
app.get('/api/dashboard/kpis', async (req: Request, res: Response) => {
  console.log('Dashboard KPIs requested from:', req.headers.origin);
  try {
    // Get vehicle counts
    const { count: totalVehicles } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true });
    
    const { count: activeVehicles } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');
    
    // Get fuel event counts
    const { count: totalRefills } = await supabase
      .from('fuel_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'refill');
    
    const { count: totalThefts } = await supabase
      .from('fuel_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'theft');
    
    // Get total fuel used
    const { data: vehiclesData } = await supabase
      .from('vehicles')
      .select('total_fuel_used, total_distance, total_engine_hours');
    
    const totals = vehiclesData?.reduce((acc, vehicle) => ({
      fuel: acc.fuel + (vehicle.total_fuel_used || 0),
      distance: acc.distance + (vehicle.total_distance || 0),
      engineHours: acc.engineHours + (vehicle.total_engine_hours || 0),
    }), { fuel: 0, distance: 0, engineHours: 0 }) || { fuel: 0, distance: 0, engineHours: 0 };
    
    res.json({
      totalVehicles: totalVehicles || 0,
      activeVehicles: activeVehicles || 0,
      totalRefills: totalRefills || 0,
      totalThefts: totalThefts || 0,
      totalFuelUsed: totals.fuel,
      totalDistance: totals.distance,
      totalEngineHours: totals.engineHours,
      fleetUtilization: Math.round((activeVehicles || 0) / (totalVehicles || 1) * 100),
      lastUpdated: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Dashboard KPIs error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ==================== DAILY METRICS API ====================
app.get('/api/daily-metrics', async (req: Request, res: Response) => {
  try {
    const { vehicle_id, start_date, end_date } = req.query;
    
    let query = supabase
      .from('daily_metrics')
      .select('*')
      .order('metric_date', { ascending: false });
    
    if (vehicle_id) query = query.eq('vehicle_id', vehicle_id);
    if (start_date) query = query.gte('metric_date', start_date);
    if (end_date) query = query.lte('metric_date', end_date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error: any) {
    console.error('Daily metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch daily metrics' });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 FUEL PLATFORM BACKEND - PRODUCTION READY');
  console.log('='.repeat(60));
  console.log(`📡 Server URL: http://localhost:${PORT}`);
  console.log(`🔧 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`🚗 Vehicles API: http://localhost:${PORT}/api/vehicles`);
  console.log(`⛽ Fuel Events API: http://localhost:${PORT}/api/fuel-events`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard/kpis`);
  console.log(`📈 Daily Metrics: http://localhost:${PORT}/api/daily-metrics`);
  console.log('='.repeat(60));
  console.log('✅ Connected to Supabase Database');
  console.log('='.repeat(60));
});