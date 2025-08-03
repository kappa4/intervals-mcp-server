# Custom Fields Support

This document describes the custom fields support in the Intervals.icu MCP server implementation.

## Overview

Intervals.icu supports custom fields for both activities and wellness data. These fields are dynamically added to the API response and are now fully supported in our MCP server implementation.

## Important Discovery

Custom fields in Intervals.icu are managed through a separate API endpoint:
- Custom field definitions: `/api/v1/athlete/{id}/custom-item`
- Field types:
  - `INPUT_FIELD`: Wellness custom fields
  - `ACTIVITY_FIELD`: Activity custom fields

The actual field values might be stored in the `user_data` object within wellness/activity responses, or at the top level of the response.

## Implementation Details

### Type Definitions

Custom fields are supported through TypeScript index signatures:

```typescript
export interface IntervalsActivity {
  // ... standard fields ...
  // Custom fields can be added dynamically
  [key: string]: any;
}

export interface IntervalsWellness {
  // ... standard fields ...
  // Custom fields can be added dynamically
  [key: string]: any;
}
```

### API Response Handling

The Intervals.icu API returns custom fields at the top level of the response object. For example:

```json
{
  "id": 12345,
  "name": "Morning Ride",
  "type": "Ride",
  "session_rpe": 7,
  "Tags": "Training",
  "SWOLF": 9.79
}
```

### MCP Handler Display

The MCP handler now includes custom fields in the output for:

1. **get_activities**: Lists activities with custom fields
2. **get_activity**: Shows detailed activity information including custom fields
3. **get_wellness**: Shows wellness data with custom fields

Custom fields are displayed in a separate section:

```
**Custom Fields:**
- session_rpe: 7
- Tags: Training
- SWOLF: 9.79
```

## Known Limitations

1. Custom fields can be nullable - if no value is set, the field may not appear in the API response
2. Field names are case-sensitive
3. Custom fields must be manually created in the Intervals.icu web interface
4. There's no automatic sync from devices like Garmin for custom fields

## Testing

To test custom fields:

1. Create custom fields in your Intervals.icu account (Settings → Custom Fields)
2. Add values to these fields for some activities or wellness entries
3. Use the MCP tools to retrieve the data:
   - `get_activities` to see custom fields in activity lists
   - `get_activity` with a specific activity ID
   - `get_wellness` to see custom wellness fields

## References

- [Custom Activity Fields Forum Post](https://forum.intervals.icu/t/custom-activity-fields/25515)
- [Custom Wellness Fields Forum Post](https://forum.intervals.icu/t/custom-wellness-fields/23188)