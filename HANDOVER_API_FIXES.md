# API Response Format Fixes - Handover Document

## Overview
This document describes the API response format issues encountered and fixed during the TypeScript migration of the Intervals.icu MCP server.

## Issues Encountered

### 1. Array vs Object Response Mismatch
**Problem**: The TypeScript code expected all list endpoints to return `{ data: [...] }` format, but Intervals.icu API returns arrays directly.

**Example Error**:
```
TypeError: Cannot read properties of undefined (reading 'length')
    at MCPHandler.getWellness (file:///src/mcp-handler.ts:474:23)
```

**Root Cause**: Code was trying to access `wellness.data.length` when the API returned the array directly.

### 2. Athlete Object Structure
**Problem**: The code expected `athlete.user.email` but the API returns `athlete.email` directly.

**Example Error**:
```
TypeError: Cannot read properties of undefined (reading 'email')
    at MCPHandler.getAthleteInfo (file:///src/mcp-handler.ts:515:40)
```

## Solutions Implemented

### 1. Wrapper Pattern for List Endpoints
All list endpoints now wrap the array response:

```typescript
// Before (incorrect)
async getWellnessData(filters: WellnessFilters = {}): Promise<IntervalsListResponse<IntervalsWellness>> {
  return this.makeRequest<IntervalsListResponse<IntervalsWellness>>(`/wellness${query}`);
}

// After (correct)
async getWellnessData(filters: WellnessFilters = {}): Promise<IntervalsListResponse<IntervalsWellness>> {
  const data = await this.makeRequest<IntervalsWellness[]>(`/wellness${query}`);
  return { data }; // Wrap array in expected format
}
```

### 2. Fixed Type Definitions
Updated `IntervalsAthlete` interface:

```typescript
// Before
export interface IntervalsAthlete {
  id: string;
  name: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
  // ...
}

// After
export interface IntervalsAthlete {
  id: string;
  name: string;
  email?: string;
  // ...
}
```

## Debugging Process

### 1. Using Deno Deploy Logs
```bash
# Get recent logs
deployctl logs --project=kpnco-intervals-mcp-77 --limit=50

# Filter for errors
deployctl logs --project=kpnco-intervals-mcp-77 --grep="ERROR" --limit=30
```

### 2. Verifying API Response Format
Added debug logging to understand response structure:
```typescript
if (endpoint.includes('/wellness')) {
  log("DEBUG", `Wellness response type: ${Array.isArray(data) ? 'array' : typeof data}`);
}
```

### 3. Using OpenAPI Spec
Checked actual response types:
```bash
# Check wellness endpoint
jq '.paths["/api/v1/athlete/{id}/wellness{ext}"].get.responses."200".content."*/*".schema' docs/intervals-openapi-spec.json
# Output: { "type": "array", "items": { "$ref": "#/components/schemas/Wellness" } }
```

## Endpoints Requiring Special Handling

1. **List Endpoints** (return arrays, need wrapping):
   - `/wellness` → `/wellness{ext}`
   - `/activities`
   - `/events` → `/events{format}`
   - `/workouts`

2. **Single Item Endpoints** (return objects directly):
   - `/wellness/{date}`
   - `/activities/{activityId}` (Note: May actually return array in real API)
   - `/events/{eventId}`
   - `/workouts/{workoutId}`
   - `/` (athlete endpoint)

## Testing Checklist

When modifying API integration:

1. [ ] Check OpenAPI spec for correct response format
2. [ ] Add debug logging to verify actual response
3. [ ] Test locally with real API
4. [ ] Deploy and check production logs
5. [ ] Test in Claude.ai interface

## Common Pitfalls

1. **Don't assume nested structures** - Check actual API response
2. **List endpoints may need extensions** - e.g., `{ext}` or `{format}`
3. **DELETE endpoints may not exist** - Verify in OpenAPI spec
4. **Array responses need wrapping** - Our code expects `{ data: [...] }`

## Additional Issues Fixed (2025-08-03)

### 1. get_activities without date range (422 Error)
**Problem**: Intervals.icu API requires date range, returns 422 without it
**Solution**: Added default date range (last 30 days) when not specified

### 2. get_activity returns all undefined fields
**Problem**: Wrong endpoint path `/activities/{id}` doesn't exist
**Solution**: Use `/api/v1/athlete/{athleteId}/activities/{ids}` which returns an array

### 3. update_activity returns 405 Method Not Allowed
**Problem**: Intervals.icu API doesn't support activity updates via API
**Solution**: ~~Return clear error message that updates must be done via web interface~~
**Final Solution**: Removed the `update_activity` tool entirely from the MCP server

### 4. update_wellness returns undefined date
**Problem**: API response doesn't include the date field
**Solution**: Fallback to input date when response.date is undefined

## References

- OpenAPI Spec: `docs/intervals-openapi-spec.json`
- API Integration Guide: `INTERVALS_API_INTEGRATION.md`
- TypeScript Migration: `HANDOVER_TYPESCRIPT_MIGRATION.md`