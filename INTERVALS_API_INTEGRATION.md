# Intervals.icu API Integration Guide

This document describes the correct way to integrate with the Intervals.icu API, based on lessons learned during development.

## Key Learnings

### 1. Response Format Differences

The Intervals.icu API returns different response formats for list vs single item endpoints:

- **List endpoints** (e.g., `/wellness`, `/activities`, `/events`): Return arrays directly `[{...}, {...}]`
- **Single item endpoints** (e.g., `/wellness/{date}`, `/activities/{id}`): Return objects directly `{...}`

However, our MCP implementation expects all list responses to be wrapped in a `{ data: [...] }` format for consistency.

### 2. Correct Endpoint Paths

Many list endpoints require a format extension:

- ❌ Wrong: `/api/v1/athlete/{id}/wellness`
- ✅ Correct: `/api/v1/athlete/{id}/wellness{ext}` (where `{ext}` can be empty)

- ❌ Wrong: `/api/v1/athlete/{id}/events`  
- ✅ Correct: `/api/v1/athlete/{id}/events{format}` (where `{format}` can be empty)

### 3. Athlete Endpoint Schema

The athlete endpoint returns data directly on the object, not nested:

- ❌ Wrong: `athlete.user.email`
- ✅ Correct: `athlete.email`

## Implementation Pattern

When implementing a list endpoint, always wrap the response:

```typescript
// Wellness list example
async getWellnessData(filters: WellnessFilters = {}): Promise<IntervalsListResponse<IntervalsWellness>> {
  const searchParams = new URLSearchParams();
  // ... build query params ...
  
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const data = await this.makeRequest<IntervalsWellness[]>(`/wellness${query}`);
  
  // Intervals.icu returns array directly, wrap it in our expected format
  return { data };
}
```

## Debugging Tips

1. **Add response logging** to understand the actual response structure:
   ```typescript
   const data = await response.json();
   log("DEBUG", `Response type: ${Array.isArray(data) ? 'array' : typeof data}`);
   ```

2. **Check the OpenAPI spec** (`docs/intervals-openapi-spec.json`) to verify response types:
   ```bash
   jq '.paths["/api/v1/athlete/{id}/wellness{ext}"].get.responses."200".content."*/*".schema' docs/intervals-openapi-spec.json
   ```

3. **Use deployctl logs** to view production logs:
   ```bash
   deployctl logs --project=your-project --limit=50
   ```

## Common Errors and Solutions

### Error: "Cannot read properties of undefined (reading 'length')"
**Cause**: Expecting `response.data.length` when API returns array directly
**Solution**: Wrap array response in `{ data: array }` format

### Error: "Cannot read properties of undefined (reading 'email')"
**Cause**: Accessing nested property that doesn't exist (e.g., `athlete.user.email`)
**Solution**: Check actual response structure and update property access

## Testing Checklist

When adding a new endpoint:

1. [ ] Check the OpenAPI spec for the correct path (including extensions)
2. [ ] Verify if response is array or object
3. [ ] If array, wrap in `{ data: array }` format
4. [ ] Test locally first
5. [ ] Deploy and check production logs
6. [ ] Test in Claude.ai

## Reference

- OpenAPI Spec: `docs/intervals-openapi-spec.json`
- API Client: `intervals-client.ts`
- MCP Handler: `mcp-handler.ts`