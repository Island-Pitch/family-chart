# Cascade Link Lines - Cross-Depth Level Extension

## Problem

The existing cascading link lines system successfully handles overlaps between sibling groups that share the same drop point (same parent pair). However, it only processes overlaps within the same depth level (Y position band).

When siblings from **different parent groups** are positioned close together horizontally (like "Liam" and the "Child Child" group), their link lines can overlap even though they're at slightly different Y positions (different depth levels). This causes visual collisions that the current system doesn't detect.

## Example Case

When viewing a tree with Mary selected:
- **Liam** is a child of Mary (from one parent pair)
- **Child Child** group are children of Mary (from another parent pair)
- These sibling groups are positioned close together horizontally
- Their link lines overlap visually, even though they're at slightly different Y positions
- The current system doesn't detect this because they're in different depth levels

**Desired behavior**: The link lines should cascade vertically (like "Alfred" and "Unknown" when Ellie is selected), with the leftmost group having the highest break point and subsequent groups cascading downward.

## Solution

Extended the `adjustOverlappingLinkBreaks` function in `link-overlap-adjuster.ts` to:

1. **Merge adjacent depth levels** that have overlapping X ranges
2. **Process merged groups together** so the cascade logic works across depth levels, not just within them

### Key Changes

#### 1. New Function: `mergeOverlappingDepthLevels()`

This function:
- Takes the initial depth level groups (segments grouped by Y position)
- Calculates X range (min/max) and representative Y for each level
- Detects when adjacent levels have:
  - Overlapping X ranges (horizontal segments would collide)
  - Close Y positions (within 60px threshold)
- Merges overlapping levels using transitive closure (if A overlaps B and B overlaps C, merge A+B+C)
- Returns merged level groups for processing

#### 2. Updated Processing Flow

**Before:**
```
1. Group segments by depth level (Y position bands)
2. Process each depth level independently
3. Only detect overlaps within same depth level
```

**After:**
```
1. Group segments by depth level (Y position bands)
2. Merge adjacent depth levels with overlapping X ranges
3. Process merged level groups together
4. Detect overlaps across merged levels (handles cross-depth overlaps)
```

### Algorithm Details

```typescript
function mergeOverlappingDepthLevels(depthLevels: BreakSegment[][]): BreakSegment[][]
```

**Parameters:**
- `X_OVERLAP_TOLERANCE = 10px` - Small tolerance for X range overlap detection
- `Y_PROXIMITY_THRESHOLD = 60px` - Maximum Y distance for merging levels

**Merge Criteria:**
Two depth levels are merged if:
1. Their X ranges overlap (with 10px tolerance)
2. Their Y positions are within 60px of each other

**Transitive Closure:**
- If level A overlaps B and B overlaps C, then A, B, C are all merged
- Ensures all connected overlapping levels are processed together

### Example Flow

**Input:** 3 depth levels
- Level 0: Segments at Y=100, X range [50, 150] (Liam's links)
- Level 1: Segments at Y=130, X range [120, 220] (Child Child group links)
- Level 2: Segments at Y=200, X range [300, 400] (unrelated links)

**Processing:**
1. Level 0 and Level 1 have overlapping X ranges ([50,150] vs [120,220])
2. Y distance is 30px (within 60px threshold)
3. Levels 0 and 1 are merged
4. Level 2 has no overlap, stays separate

**Output:** 2 merged groups
- Merged Group 0: Levels 0+1 (Liam + Child Child) - will cascade together
- Merged Group 1: Level 2 (unrelated) - no adjustment needed

## Benefits

1. **Handles cross-depth overlaps**: Detects overlaps between sibling groups from different parent pairs even when at different Y positions
2. **Maintains existing behavior**: Still processes same-depth overlaps as before
3. **Transitive closure**: Ensures all connected overlapping levels are handled together
4. **Configurable thresholds**: X overlap tolerance and Y proximity threshold can be tuned

## Testing

To test this change:

1. Load a tree where siblings from different parent groups are close together (e.g., Mary's tree with Liam and Child Child group)
2. Verify that link lines cascade vertically (leftmost group highest, subsequent groups lower)
3. Compare with the "Alfred and Unknown" case when Ellie is selected (should look similar)

## Files Modified

- `tmp/family-chart/src/utils/link-overlap-adjuster.ts`
  - Added `mergeOverlappingDepthLevels()` function
  - Updated `adjustOverlappingLinkBreaks()` to use merged levels

## Related Work

This extends the cascading link lines work done in previous commits that handled overlaps within the same drop point group. This new extension handles overlaps across different drop point groups when they're positioned close together.

