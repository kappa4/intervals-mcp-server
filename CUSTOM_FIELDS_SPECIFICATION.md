# Intervals.icu Custom Fields Specification

## Overview

Based on implementation and testing, this document outlines the complete specification for custom fields in Intervals.icu API.

## API Structure

### Custom Field Definitions
- **Endpoint**: `/api/v1/athlete/{id}/custom-item`
- **Method**: GET
- **Returns**: Array of `CustomItem` objects

### Custom Field Types

| Type | Purpose | Example Use Cases |
|------|---------|-------------------|
| `INPUT_FIELD` | Wellness custom fields | UCRVolatilityBandPosition, custom health metrics |
| `ACTIVITY_FIELD` | Activity custom fields | Session RPE, training tags, custom activity metrics |
| `FITNESS_CHART` | Custom fitness charts | - |
| `TRACE_CHART` | Custom trace charts | - |
| `INTERVAL_FIELD` | Interval custom fields | - |
| `ACTIVITY_STREAM` | Activity stream data | - |
| `ACTIVITY_CHART` | Activity-specific charts | - |
| `ACTIVITY_HISTOGRAM` | Activity histograms | - |
| `ACTIVITY_HEATMAP` | Activity heatmaps | - |
| `ACTIVITY_MAP` | Activity maps | - |
| `ACTIVITY_PANEL` | Activity panels | - |

## Data Storage Location

### Wellness Custom Fields
Custom wellness field values are stored **at the top level** of the wellness API response, not in a nested object.

**Example Response:**
```json
{
  "id": "2025-08-03",
  "date": "2025-08-03",
  "weight": 70.5,
  "sleepQuality": 4,
  "UCRVolatilityBandPosition": 2.3,
  "customMetric": "value",
  "stress": 3
}
```

### Activity Custom Fields
Activity custom fields are also stored **at the top level** of the activity API response.

**Example Response:**
```json
{
  "id": "12345678",
  "name": "Morning Ride",
  "type": "Ride",
  "session_rpe": 7,
  "Tags": "Training",
  "SWOLF": 9.79,
  "distance": 25000
}
```

## Implementation Details

### Field Detection Logic
Custom fields are identified by:
1. Excluding known standard fields (from OpenAPI spec)
2. Excluding system/internal fields (starting with `_`, `cursor`, `data`)
3. Remaining fields with non-null/non-undefined values are considered custom

### Known Standard Fields

#### Wellness Standard Fields
```javascript
const wellnessStandardFields = [
  'abdomen', 'atl', 'atlLoad', 'avgSleepingHR', 'baevskySI', 'bloodGlucose',
  'bodyFat', 'comments', 'ctl', 'ctlLoad', 'diastolic', 'fatigue', 'hrv',
  'hrvSDNN', 'hydration', 'hydrationVolume', 'id', 'injury', 'kcalConsumed',
  'lactate', 'locked', 'menstrualPhase', 'menstrualPhasePredicted', 'mood',
  'motivation', 'rampRate', 'readiness', 'respiration', 'restingHR',
  'sleepQuality', 'sleepScore', 'sleepSecs', 'soreness', 'spO2', 'sportInfo',
  'steps', 'stress', 'systolic', 'updated', 'vo2max', 'weight',
  // Snake_case variants
  'created', 'date', 'sleep_quality', 'sleep_hours', 'body_fat',
  'hr_variability', 'hrv_rmssd', 'resting_hr', 'menstrual_phase',
  'sick', 'injured', 'notes', 'user_data'
];
```

#### Activity Standard Fields
Activity standard fields are extensive (169+ fields from OpenAPI spec). See `docs/intervals-openapi-spec.json` for complete list.

## Field Naming Conventions

### Requirements (from Forum)
- Field codes must be in **CamelCase**
- Field codes **cannot start with a number**
- Example: `UCRVolatilityBandPosition` ✅
- Example: `2ndMetric` ❌

### Data Types
- Numeric fields support decimal values
- Text fields support string values
- Boolean fields are supported
- Some validation restrictions may apply (e.g., negative numbers)

## MCP Implementation

### Display Format
Custom fields are displayed in a separate section:

```
**Custom Fields:**
- UCRVolatilityBandPosition: 2.3
- sessionRPE: 7
- trainingTags: Recovery
```

### Error Handling
- Null/undefined values are ignored
- System fields are filtered out
- Only actual custom fields are displayed

## Testing Verified Examples

### Wellness Custom Fields
✅ **Successfully detected and displayed:**
- `UCRVolatilityBandPosition`
- Various custom health metrics
- User-defined tracking fields

### Activity Custom Fields
✅ **Framework ready** (pending activity ID fix):
- `session_rpe`
- `Tags`
- `SWOLF`
- Custom training metrics

## API Limitations

1. **Manual Population**: Custom fields must be manually populated (no automatic device sync)
2. **Validation Rules**: Strict naming conventions and data type requirements
3. **Visibility**: Custom fields respect athlete privacy settings
4. **Access Control**: Only accessible for authenticated athlete's own data

## References

- [Custom Activity Fields Forum](https://forum.intervals.icu/t/custom-activity-fields/25515)
- [Custom Wellness Fields Forum](https://forum.intervals.icu/t/custom-wellness-fields/23188)
- OpenAPI Spec: `/docs/intervals-openapi-spec.json`
- Implementation: `intervals-client.ts`, `mcp-handler.ts`

## Last Updated
2025-08-03 - Based on successful implementation and testing