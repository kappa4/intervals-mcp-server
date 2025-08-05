/**
 * Intervals.icu API type definitions
 * Based on the Python implementation analysis
 */

export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
  description?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  trainer?: boolean;
  commute?: boolean;
  icu_training_load?: number;
  icu_atl?: number;
  icu_ctl?: number;
  icu_tss?: number;
  icu_intensity?: number;
  icu_ri?: number;
  icu_ef?: number;
  icu_hr_zones?: number[];
  icu_power_zones?: number[];
  power_meter?: boolean;
  power_meter_battery?: number;
  heart_rate_monitor?: boolean;
  external_id?: string;
  created: string;
  updated: string;
  // Custom fields can be added dynamically
  [key: string]: any;
}

export interface IntervalsWellness {
  id: string;
  created: string;
  updated: string;
  date: string;
  sleep_quality?: number;
  sleep_hours?: number;
  soreness?: number;
  fatigue?: number;
  stress?: number;
  motivation?: number;
  weight?: number;
  body_fat?: number;
  hr_variability?: number;
  hrv_rmssd?: number;
  resting_hr?: number;
  menstrual_phase?: number;
  sick?: boolean;
  injured?: boolean;
  notes?: string;
  readiness?: number;  // UCR score (0-100)
  sleepSecs?: number;  // Sleep seconds (alternative to sleep_hours)
  sleepScore?: number; // Sleep score (0-100)
  hrv?: number;        // HRV value (alias for hr_variability)
  restingHR?: number;  // Resting HR (alias for resting_hr)
  injury?: number;     // Injury level (1-4 scale)
  mood?: number;       // Mood level
  ctl?: number;        // Chronic Training Load
  atl?: number;        // Acute Training Load
  rampRate?: number;   // Ramp rate
  ctlLoad?: number;    // CTL load
  atlLoad?: number;    // ATL load
  sportInfo?: Record<string, any>; // Sport-specific information
  user_data?: Record<string, any>;
  // Custom fields can be added dynamically
  [key: string]: any;
}

export interface IntervalsEventData {
  id: string;
  created: string;
  updated: string;
  start_date_local: string;
  category: string;
  name: string;
  description?: string;
  show_on_calendar?: boolean;
  colour?: string;
  tags?: string[];
}

export interface IntervalsAthlete {
  id: string;
  name: string;
  email?: string;
  created: string;
  updated: string;
  oldest_activity_at?: string;
  newest_activity_at?: string;
  activity_count?: number;
  premium?: boolean;
  time_zone?: string;
  week_start?: number;
  date_preference?: string;
  measurement_preference?: string;
  power_meter_ftp?: number;
  power_meter_w_prime?: number;
  default_max_hr?: number;
  default_rest_hr?: number;
  default_threshold_hr?: number;
  power_zones?: number[];
  hr_zones?: number[];
}

export interface IntervalsWorkout {
  id: string;
  created: string;
  updated: string;
  name: string;
  description?: string;
  workout_doc?: string;
  category?: string;
  tags?: string[];
  outdoor?: boolean;
  icu_ignore_time?: boolean;
  icu_ignore_hr?: boolean;
  icu_ignore_power?: boolean;
  icu_TSS?: number;
  icu_IF?: number;
}

export interface IntervalsListResponse<T> {
  data: T[];
  cursor?: string;
}

export interface IntervalsAPIOptions {
  athlete_id: string;
  api_key: string;
  base_url?: string;
}

export interface ActivityFilters {
  type?: string;
  oldest?: string;
  newest?: string;
  limit?: number;
  cursor?: string;
}

export interface WellnessFilters {
  oldest?: string;
  newest?: string;
  limit?: number;
  cursor?: string;
}

export interface EventFilters {
  category?: string;
  oldest?: string;
  newest?: string;
  limit?: number;
  cursor?: string;
}

export interface IntervalsCustomItem {
  id: number;
  athlete_id: string;
  type: 'FITNESS_CHART' | 'TRACE_CHART' | 'INPUT_FIELD' | 'ACTIVITY_FIELD' | 
        'INTERVAL_FIELD' | 'ACTIVITY_STREAM' | 'ACTIVITY_CHART' | 
        'ACTIVITY_HISTOGRAM' | 'ACTIVITY_HEATMAP' | 'ACTIVITY_MAP' | 'ACTIVITY_PANEL';
  visibility: 'PRIVATE' | 'FOLLOWERS' | 'PUBLIC';
  name: string;
  description?: string;
  image?: string;
  content?: Record<string, any>;
  usage_count?: number;
  athlete_only?: boolean;
  athlete_cannot_edit?: boolean;
  created?: string;
  updated?: string;
}