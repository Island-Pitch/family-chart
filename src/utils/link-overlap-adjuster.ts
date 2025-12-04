/**
 * Utility to detect and adjust overlapping horizontal break segments in family tree links.
 * When multiple sibling groups have links that would overlap at their horizontal break points,
 * this adjusts the break heights (hy values) to prevent collisions.
 */

import { Link } from "../layout/create-links";
import { Tree } from "../layout/calculate-tree";
import { TreeDatum } from "../types/treeData";

interface BreakSegment {
  link: Link;
  hy: number;  // break Y coordinate (for vertical layout)
  hx: number;   // break X coordinate (for horizontal layout)
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  dropPointKey: string;  // drop point identifier (X coordinate)
}

/**
 * Detects overlapping horizontal break segments and adjusts their coordinates
 * to prevent collisions between sibling groups' link lines.
 * 
 * COMPREHENSIVE APPROACH:
 * 1. Group links by their DEPTH LEVEL (Y break height band) - links at different
 *    depths shouldn't affect each other
 * 2. Within each depth level, group by drop point X
 * 3. Detect overlaps within each depth level and adjust as needed
 * 4. Works for both ancestry (going up) and progeny (going down) directions
 */
export function adjustOverlappingLinkBreaks(links: Link[], tree: Tree): Link[] {
  console.log('[adjustOverlappingLinkBreaks] Starting with', links.length, 'links', {
    mainId: tree.main_id,
    isHorizontal: tree.is_horizontal,
    treeDataLength: tree.data.length
  });
  
  if (tree.is_horizontal) {
    return adjustOverlappingLinkBreaksHorizontal(links, tree);
  }
  
  // First, extract all link segments and categorize them
  const allSegments: BreakSegment[] = [];
  let processedLinks = 0;
  let skippedLinks = 0;
  
  links.forEach(link => {
    // Only process parent-child links (curved links, not spouse links)
    if (!link.curve || link.spouse) {
      skippedLinks++;
      return;
    }
    
    // Extract break point information
    const segment = extractBreakSegmentVertical(link);
    if (!segment) {
      skippedLinks++;
      return;
    }
    
    // Get drop point key
    const groupKey = getDropPointKey(link);
    if (!groupKey) {
      skippedLinks++;
      return;
    }
    
    segment.dropPointKey = groupKey;
    allSegments.push(segment);
    processedLinks++;
  });
  
  console.log(`[adjustOverlappingLinkBreaks] Extracted ${processedLinks} segments, skipped ${skippedLinks}`);
  
  if (allSegments.length === 0) {
    return links;
  }
  
  // Group segments by their break height BAND (depth level)
  // Links at similar Y levels (within a tolerance) are at the same depth
  const DEPTH_TOLERANCE = 30; // Links within 30px of each other are considered same level
  const depthLevels = groupByDepthLevel(allSegments, DEPTH_TOLERANCE);
  
  console.log(`[adjustOverlappingLinkBreaks] Found ${depthLevels.length} depth levels`);
  
  // EXTENDED: Merge adjacent depth levels that have overlapping X ranges
  // This handles cases like "Liam" and "Child Child" group where siblings from
  // different parent groups are positioned close together horizontally
  const mergedLevels = mergeOverlappingDepthLevels(depthLevels);
  
  console.log(`[adjustOverlappingLinkBreaks] After merging overlapping levels: ${mergedLevels.length} processing groups`);
  
  // Process each merged level group
  const allAdjustments = new Map<string, number>(); // linkId -> adjustment
  
  mergedLevels.forEach((levelSegments, levelIndex) => {
    console.log(`[adjustOverlappingLinkBreaks] Processing level group ${levelIndex} with ${levelSegments.length} segments`);
    
    // Within this level group, group by drop point
    const dropPointGroups = new Map<string, BreakSegment[]>();
    levelSegments.forEach(segment => {
      if (!dropPointGroups.has(segment.dropPointKey)) {
        dropPointGroups.set(segment.dropPointKey, []);
      }
      dropPointGroups.get(segment.dropPointKey)!.push(segment);
    });
    
    console.log(`[adjustOverlappingLinkBreaks]   Level group ${levelIndex} has ${dropPointGroups.size} drop point groups`);
    
    // If only one drop point group at this level, no overlap possible
    if (dropPointGroups.size <= 1) {
      return;
    }
    
    // Detect and adjust overlaps within this level group (may span multiple original depth levels)
    const levelAdjustments = adjustDepthLevel(dropPointGroups);
    
    // Merge adjustments
    levelAdjustments.forEach((adjustment, linkId) => {
      allAdjustments.set(linkId, adjustment);
    });
  });
  
  console.log(`[adjustOverlappingLinkBreaks] Total adjustments: ${allAdjustments.size}`);
  
  // Apply all adjustments to links
  return links.map(link => {
    const adjustment = allAdjustments.get(link.id);
    if (adjustment === undefined || adjustment === 0) {
      return link;
    }
    
    // Create a new link with adjusted path data
    return {
      ...link,
      d: link.d.map((point, i) => {
        // Points at indices 1, 2, 3, 4 have the hy Y coordinate
        if (i >= 1 && i <= 4 && point[1] !== undefined) {
          return [point[0], point[1] + adjustment] as [number, number];
        }
        return point;
      })
    };
  });
}

/**
 * Group segments by their depth level (break height band)
 * Segments with similar hy values are at the same depth
 */
function groupByDepthLevel(segments: BreakSegment[], tolerance: number): BreakSegment[][] {
  if (segments.length === 0) return [];
  
  // Sort by hy (break height)
  const sorted = [...segments].sort((a, b) => a.hy - b.hy);
  
  const levels: BreakSegment[][] = [];
  let currentLevel: BreakSegment[] = [sorted[0]];
  let currentLevelHy = sorted[0].hy;
  
  for (let i = 1; i < sorted.length; i++) {
    const segment = sorted[i];
    // If this segment's hy is within tolerance of the current level, add to current level
    if (Math.abs(segment.hy - currentLevelHy) <= tolerance) {
      currentLevel.push(segment);
    } else {
      // Start a new level
      levels.push(currentLevel);
      currentLevel = [segment];
      currentLevelHy = segment.hy;
    }
  }
  
  // Don't forget the last level
  if (currentLevel.length > 0) {
    levels.push(currentLevel);
  }
  
  return levels;
}

/**
 * Merge adjacent depth levels that have overlapping X ranges.
 * This handles cases where siblings from different parent groups (different drop points)
 * are positioned close together horizontally, causing their link lines to overlap even
 * though they're at slightly different Y positions (different depth levels).
 * 
 * Example: "Liam" (from one parent) and "Child Child" group (from another parent)
 * might be at different depth levels but their X ranges overlap, causing visual collisions.
 * 
 * Algorithm:
 * 1. For each depth level, calculate its X range (min/max of all segments)
 * 2. Check if adjacent levels have overlapping X ranges
 * 3. If they overlap and are close enough in Y, merge them into a single processing group
 * 4. This allows the cascade logic to work across depth levels, not just within them
 */
function mergeOverlappingDepthLevels(depthLevels: BreakSegment[][]): BreakSegment[][] {
  if (depthLevels.length <= 1) {
    return depthLevels; // Nothing to merge
  }
  
  // Calculate X range and representative Y for each level
  interface LevelInfo {
    segments: BreakSegment[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    avgY: number;
  }
  
  const levelInfos: LevelInfo[] = depthLevels.map(levelSegments => {
    const xMin = Math.min(...levelSegments.map(s => s.xMin));
    const xMax = Math.max(...levelSegments.map(s => s.xMax));
    const yMin = Math.min(...levelSegments.map(s => s.hy));
    const yMax = Math.max(...levelSegments.map(s => s.hy));
    const avgY = levelSegments.reduce((sum, s) => sum + s.hy, 0) / levelSegments.length;
    
    return {
      segments: levelSegments,
      xMin,
      xMax,
      yMin,
      yMax,
      avgY
    };
  });
  
  // Check if two levels should be merged (overlapping X ranges and close in Y)
  const X_OVERLAP_TOLERANCE = 10; // Small tolerance for X range overlap detection
  const Y_PROXIMITY_THRESHOLD = 60; // If levels are within 60px in Y and X overlaps, merge them
  
  function shouldMerge(a: LevelInfo, b: LevelInfo): boolean {
    // Check if X ranges overlap
    const xOverlaps = !(a.xMax < b.xMin - X_OVERLAP_TOLERANCE || a.xMin > b.xMax + X_OVERLAP_TOLERANCE);
    
    if (!xOverlaps) {
      return false; // No X overlap, don't merge
    }
    
    // Check if Y positions are close enough
    const yDistance = Math.abs(a.avgY - b.avgY);
    const yClose = yDistance <= Y_PROXIMITY_THRESHOLD;
    
    if (yClose) {
      console.log(`[mergeOverlappingDepthLevels] Merging levels: X ranges overlap (${a.xMin.toFixed(0)}-${a.xMax.toFixed(0)} vs ${b.xMin.toFixed(0)}-${b.xMax.toFixed(0)}), Y distance: ${yDistance.toFixed(1)}px`);
    }
    
    return yClose;
  }
  
  // Build merge groups using transitive closure
  // If level A overlaps B and B overlaps C, then A, B, C should all be merged
  const mergedGroups: BreakSegment[][] = [];
  const processed = new Set<number>();
  
  levelInfos.forEach((levelInfo, index) => {
    if (processed.has(index)) {
      return; // Already merged into another group
    }
    
    // Start a new merge group with this level's segments
    const mergeGroupIndices = new Set<number>([index]);
    processed.add(index);
    
    // Find all levels that should be merged with this one (transitive closure)
    let foundNew = true;
    while (foundNew) {
      foundNew = false;
      levelInfos.forEach((otherLevelInfo, otherIndex) => {
        if (processed.has(otherIndex)) {
          return; // Already in merge group
        }
        
        // Check if this level overlaps with any level already in the merge group
        const overlapsWithGroup = Array.from(mergeGroupIndices).some(groupIndex => {
          return shouldMerge(levelInfos[groupIndex], otherLevelInfo);
        });
        
        if (overlapsWithGroup) {
          mergeGroupIndices.add(otherIndex);
          processed.add(otherIndex);
          foundNew = true;
          console.log(`[mergeOverlappingDepthLevels] Added level ${otherIndex} to merge group (transitive overlap)`);
        }
      });
    }
    
    // Combine all segments from merged levels
    const mergeGroup: BreakSegment[] = [];
    mergeGroupIndices.forEach(groupIndex => {
      mergeGroup.push(...levelInfos[groupIndex].segments);
    });
    
    mergedGroups.push(mergeGroup);
  });
  
  console.log(`[mergeOverlappingDepthLevels] Merged ${depthLevels.length} depth levels into ${mergedGroups.length} processing groups`);
  
  return mergedGroups;
}

/**
 * Adjust overlaps within a single depth level
 * 
 * ALGORITHM (UPDATED):
 * When multiple sibling groups have links at the SAME break height (same depth level),
 * we cascade ALL of them from left to right - not just overlapping ones.
 * 
 * This is because even if the X ranges don't overlap, having multiple horizontal
 * lines at the same Y level looks visually cluttered. Better to cascade them.
 * 
 * The cascading order is determined by drop point X (leftmost group gets highest break).
 * 
 * Returns a map of linkId -> adjustment amount
 */
function adjustDepthLevel(dropPointGroups: Map<string, BreakSegment[]>): Map<string, number> {
  const adjustments = new Map<string, number>();
  const MIN_SEPARATION = 20;
  
  // Build group info with drop point X
  interface GroupInfo {
    groupKey: string;
    avgHy: number;
    xMin: number;
    xMax: number;
    dropPointX: number;
    segments: BreakSegment[];
  }
  
  const groupInfos: GroupInfo[] = [];
  dropPointGroups.forEach((segments, groupKey) => {
    const avgHy = segments.reduce((sum, s) => sum + s.hy, 0) / segments.length;
    const xMin = Math.min(...segments.map(s => s.xMin));
    const xMax = Math.max(...segments.map(s => s.xMax));
    const dropPointX = parseInt(groupKey.replace('drop-', '')) || 0;
    
    groupInfos.push({
      groupKey,
      avgHy,
      xMin,
      xMax,
      dropPointX,
      segments
    });
  });
  
  if (groupInfos.length <= 1) {
    return adjustments; // Nothing to adjust
  }
  
  // Calculate horizontal extent for each group (how far the link spans)
  const getHorizontalExtent = (g: GroupInfo) => Math.abs(g.xMax - g.xMin);
  
  // Sort groups by horizontal extent: LARGEST extent first
  // Links with larger horizontal extent need to "arch over" shorter ones
  // So wider-spanning links get HIGHER breaks (lower Y = closer to parents)
  groupInfos.sort((a, b) => getHorizontalExtent(b) - getHorizontalExtent(a));
  
  console.log(`[adjustDepthLevel] Groups sorted by horizontal extent (widest first):`, 
    groupInfos.map(g => `${g.groupKey} (extent: ${getHorizontalExtent(g).toFixed(0)}, xRange: ${g.xMin.toFixed(0)}-${g.xMax.toFixed(0)})`));
  
  // NEW APPROACH: Cascade ALL groups at the same depth level, not just overlapping ones
  // This prevents visual clutter when multiple sibling groups have horizontal lines at the same Y
  
  // Find the base break height (use the minimum Y = highest position on screen)
  const baseY = Math.min(...groupInfos.map(g => g.avgHy));
  
  console.log(`[adjustDepthLevel] Cascading ${groupInfos.length} groups at depth level, baseY: ${baseY.toFixed(1)}`);
  
  // Assign layers based on horizontal extent (widest first)
  // Widest group = layer 0 (highest break = lowest Y = closest to parents, arches over others)
  // Each subsequent (narrower) group gets progressively lower break (higher Y = further from parents)
  groupInfos.forEach((groupInfo, layerIndex) => {
    const targetY = baseY + (layerIndex * MIN_SEPARATION);
    const adjustment = targetY - groupInfo.avgHy;
    
    console.log(`[adjustDepthLevel]   Group ${groupInfo.groupKey}: layer ${layerIndex}, extent ${getHorizontalExtent(groupInfo).toFixed(0)}, hy ${groupInfo.avgHy.toFixed(1)} -> ${targetY.toFixed(1)} (adj: ${adjustment.toFixed(1)})`);
    
    // Apply adjustment to all links in this group
    groupInfo.segments.forEach(segment => {
      adjustments.set(segment.link.id, adjustment);
    });
  });
  
  return adjustments;
}


/**
 * Get drop point key for a link (consistent calculation used in both grouping and application)
 * 
 * IMPORTANT: For links that share the same parent pair, we need to use the SAME drop point calculation
 * to ensure they're grouped together for overlap detection.
 * 
 * When Mary I is selected:
 * - Her ancestry link (to Henry VIII + Catherine) should use the same drop point as
 * - Henry VIII's progeny links (to Elizabeth I, Edward VI) which drop from Catherine's sx
 * 
 * Solution: For progeny links, calculate drop point as midpoint of parents (same as ancestry)
 * instead of using other_parent.sx, to ensure consistent grouping.
 */
function getDropPointKey(link: Link): string | null {
  if (link.is_ancestry) {
    // For ancestry: target is [p1, p2], drop point is midpoint X
    if (Array.isArray(link.target)) {
      const parents = link.target as TreeDatum[];
      if (parents.length > 0) {
        const p1 = parents[0];
        const p2 = parents[1] || p1;
        const dropX = Math.round((p1.x + p2.x) / 2);
        return `drop-${dropX}`;
      }
    }
  } else {
    // For progeny: source is [d, other_parent]
    // Use midpoint of parents (same as ancestry) for consistent grouping
    if (Array.isArray(link.source)) {
      const parents = link.source as TreeDatum[];
      if (parents.length >= 2) {
        const p1 = parents[0];
        const p2 = parents[1];
        // Use midpoint X (same calculation as ancestry links) for consistent grouping
        const dropX = Math.round((p1.x + p2.x) / 2);
        return `drop-${dropX}`;
      }
    }
  }
  
  // Fallback: try to extract from link path
  if (link.d && link.d.length >= 6) {
    const xMax = Math.max(...link.d.map(p => p[0]).filter(x => x !== undefined && !isNaN(x)) as number[]);
    return `drop-${Math.round(xMax)}`;
  }
  
  return null;
}

/**
 * Extract break segment information from a vertical layout link
 */
function extractBreakSegmentVertical(link: Link): BreakSegment | null {
  // LinkVertical creates: [d.x, d.y], [d.x, hy], [d.x, hy], [p.x, hy], [p.x, hy], [p.x, p.y]
  // The break is at hy, spanning from min(d.x, p.x) to max(d.x, p.x)
  
  if (!link.d || link.d.length < 6) return null;
  
  // Find the hy value (Y coordinate of horizontal segment)
  // It's the Y of points at indices 1, 2, 3, 4
  const hy = link.d[1]?.[1];
  if (hy === undefined || isNaN(hy)) return null;
  
  // Find X range of horizontal segment
  // The horizontal segment spans from the child's X to the parent's X
  const xCoords = link.d.map(p => p[0]).filter(x => x !== undefined && !isNaN(x)) as number[];
  if (xCoords.length === 0) return null;
  
  const xMin = Math.min(...xCoords);
  const xMax = Math.max(...xCoords);
  
  // Find Y range (should be minimal for horizontal segment, but get full link range)
  const yCoords = link.d.map(p => p[1]).filter(y => y !== undefined && !isNaN(y)) as number[];
  if (yCoords.length === 0) return null;
  const yMin = Math.min(...yCoords);
  const yMax = Math.max(...yCoords);
  
  // Get drop point key using consistent calculation
  const dropPointKey = getDropPointKey(link);
  if (!dropPointKey) {
    // Fallback: use xMax (parent side X)
    return {
      link,
      hy,
      hx: 0, // Not used for vertical
      xMin,
      xMax,
      yMin,
      yMax,
      dropPointKey: `drop-${Math.round(xMax)}`
    };
  }
  
  return {
    link,
    hy,
    hx: 0, // Not used for vertical
    xMin,
    xMax,
    yMin,
    yMax,
    dropPointKey
  };
}

/**
 * Adjust break heights for vertical layout to prevent overlaps
 * Groups links by their shared drop point and adjusts group heights together
 */
function adjustBreakHeightsVertical(links: Link[], segments: BreakSegment[], dropPointGroups: Map<string, BreakSegment[]>): Link[] {
  const MIN_SEPARATION = 20; // Minimum vertical separation between breaks (in pixels)
  
  // Use the drop point groups that were already created
  const segmentsByGroup = dropPointGroups;
  
  // Calculate representative break height for each group (use average)
  interface GroupInfo {
    groupKey: string;
    avgHy: number;
    xMin: number;
    xMax: number;
    dropPointX: number; // The actual drop point X coordinate
    segments: BreakSegment[];
  }
  
  const groupInfos: GroupInfo[] = [];
  segmentsByGroup.forEach((groupSegments, groupKey) => {
    const avgHy = groupSegments.reduce((sum, s) => sum + s.hy, 0) / groupSegments.length;
    const xMin = Math.min(...groupSegments.map(s => s.xMin));
    const xMax = Math.max(...groupSegments.map(s => s.xMax));
    
    // Extract drop point X from group key (format: "drop-{x}")
    const dropPointX = parseInt(groupKey.replace('drop-', '')) || xMax;
    
    groupInfos.push({
      groupKey,
      avgHy,
      xMin,
      xMax,
      dropPointX,
      segments: groupSegments
    });
  });
  
  console.log(`[adjustBreakHeightsVertical] Group infos:`, groupInfos.map(g => ({
    key: g.groupKey,
    dropX: g.dropPointX,
    xRange: `${g.xMin.toFixed(0)}-${g.xMax.toFixed(0)}`,
    avgHy: g.avgHy.toFixed(1),
    segments: g.segments.length
  })));
  
  // Sort groups by drop point X position (left to right) for consistent processing
  groupInfos.sort((a, b) => a.dropPointX - b.dropPointX);
  
  console.log(`[adjustBreakHeightsVertical] Group infos sorted by drop point:`, 
    groupInfos.map(g => `${g.groupKey} (dropX: ${g.dropPointX}, hy: ${g.avgHy.toFixed(1)}, xRange: ${g.xMin.toFixed(0)}-${g.xMax.toFixed(0)})`));
  
  /**
   * Check if two groups actually overlap (would visually collide)
   * Two groups overlap if:
   * 1. Their X ranges overlap (horizontal segments intersect)
   * 2. Their Y positions are too close (within MIN_SEPARATION, meaning they would visually collide)
   */
  function groupsOverlap(a: GroupInfo, b: GroupInfo): boolean {
    // Check if X ranges overlap (the horizontal segments overlap horizontally)
    // Use a small tolerance to catch near-overlaps
    const xOverlap = !(a.xMax < b.xMin - 5 || a.xMin > b.xMax + 5);
    
    if (!xOverlap) {
      return false; // No X overlap, can't collide
    }
    
    // For Y overlap: check if the break heights are too close (would visually collide)
    // Only consider it an overlap if they're within MIN_SEPARATION (would actually touch/overlap)
    // If they're already separated by MIN_SEPARATION or more, no adjustment needed
    const yDistance = Math.abs(a.avgHy - b.avgHy);
    const yTooClose = yDistance < MIN_SEPARATION;
    
    if (yTooClose) {
      console.log(`[adjustBreakHeightsVertical] Overlap detected: ${a.groupKey} vs ${b.groupKey} (xOverlap: true, yDistance: ${yDistance.toFixed(1)} < ${MIN_SEPARATION})`);
    }
    
    return yTooClose;
  }
  
  /**
   * Build overlap clusters using transitive closure
   * If A overlaps B and B overlaps C, then A, B, C are all in the same cluster
   */
  function buildOverlapClusters(groups: GroupInfo[]): GroupInfo[][] {
    const clusters: GroupInfo[][] = [];
    const processed = new Set<string>();
    
    groups.forEach(group => {
      if (processed.has(group.groupKey)) {
        return; // Already in a cluster
      }
      
      // Start a new cluster with this group
      const cluster: GroupInfo[] = [group];
      processed.add(group.groupKey);
      
      // Find all groups that overlap with any group in this cluster (transitive closure)
      let foundNew = true;
      while (foundNew) {
        foundNew = false;
        groups.forEach(otherGroup => {
          if (processed.has(otherGroup.groupKey)) {
            return; // Already in cluster
          }
          
          // Check if this group overlaps with any group in the current cluster
          const overlapsWithCluster = cluster.some(clusterGroup => groupsOverlap(otherGroup, clusterGroup));
          
          if (overlapsWithCluster) {
            cluster.push(otherGroup);
            processed.add(otherGroup.groupKey);
            foundNew = true;
            console.log(`[adjustBreakHeightsVertical] Added ${otherGroup.groupKey} to cluster (overlaps with ${cluster.find(c => groupsOverlap(otherGroup, c))?.groupKey})`);
          }
        });
      }
      
      if (cluster.length > 1) {
        clusters.push(cluster);
        console.log(`[adjustBreakHeightsVertical] Created overlap cluster with ${cluster.length} groups: ${cluster.map(g => g.groupKey).join(', ')}`);
      } else {
        console.log(`[adjustBreakHeightsVertical] Group ${group.groupKey} has no overlaps`);
      }
    });
    
    return clusters;
  }
  
  // Build overlap clusters (handles transitive overlaps)
  const overlapClusters = buildOverlapClusters(groupInfos);
  
  console.log(`[adjustBreakHeightsVertical] Found ${overlapClusters.length} overlap clusters:`, 
    overlapClusters.map((cluster, idx) => `cluster ${idx}: ${cluster.length} groups (${cluster.map(g => g.groupKey).join(', ')})`));
  
  /**
   * Adjust heights for an overlap cluster
   * Different strategies based on cluster size and configuration
   * 
   * KEY INSIGHT: Links that span farther horizontally (to children farther from center)
   * should have HIGHER break points (lower Y value = higher on screen) so they "arch over"
   * the inner links without crossing.
   */
  function adjustCluster(cluster: GroupInfo[]): Map<string, number> {
    const adjustments = new Map<string, number>();
    
    if (cluster.length === 1) {
      // Case 1: Single group - no adjustment needed
      adjustments.set(cluster[0].groupKey, 0);
      return adjustments;
    }
    
    // Calculate horizontal extent for each group (how far the link spans horizontally)
    // Larger extent = link goes farther = should have higher break (lower Y)
    const getHorizontalExtent = (g: GroupInfo) => Math.abs(g.xMax - g.xMin);
    
    // Sort by horizontal extent: LARGEST extent first (these should be highest = lowest Y)
    // Links with larger horizontal extent need to "arch over" the shorter ones
    const sortedByExtent = [...cluster].sort((a, b) => getHorizontalExtent(b) - getHorizontalExtent(a));
    
    console.log(`[adjustBreakHeightsVertical] Cluster sorted by horizontal extent:`, 
      sortedByExtent.map(g => `${g.groupKey}: extent=${getHorizontalExtent(g).toFixed(0)}, avgHy=${g.avgHy.toFixed(1)}`));
    
    // Get the base Y position (use the highest avgHy as reference - this is closest to parents)
    const baseY = Math.min(...cluster.map(g => g.avgHy));
    
    // Assign break heights based on horizontal extent order
    // Largest extent gets the highest position (lowest Y = closest to parents)
    // Each subsequent group gets a lower position (higher Y = farther from parents)
    let currentY = baseY;
    sortedByExtent.forEach((groupInfo, idx) => {
      const targetY = currentY;
      const adjustment = targetY - groupInfo.avgHy;
      
      console.log(`[adjustBreakHeightsVertical] Group ${idx + 1} (${groupInfo.groupKey}): extent=${getHorizontalExtent(groupInfo).toFixed(0)}, hy ${groupInfo.avgHy.toFixed(1)} -> ${targetY.toFixed(1)} (adjustment: ${adjustment.toFixed(1)})`);
      adjustments.set(groupInfo.groupKey, adjustment);
      currentY = targetY + MIN_SEPARATION; // Next group goes below this one (higher Y)
    });
    
    return adjustments;
  }
  
  // Apply adjustments for each overlap cluster
  const groupAdjustments = new Map<string, number>(); // groupKey -> adjustment amount
  
  overlapClusters.forEach((cluster, clusterIndex) => {
    console.log(`[adjustBreakHeightsVertical] Processing cluster ${clusterIndex} with ${cluster.length} groups`);
    const clusterAdjustments = adjustCluster(cluster);
    
    // Merge cluster adjustments into main adjustments map
    clusterAdjustments.forEach((adjustment, groupKey) => {
      groupAdjustments.set(groupKey, adjustment);
    });
  });
  
  // Set adjustments for groups that don't overlap with anything (stay at original height)
  groupInfos.forEach(group => {
    if (!groupAdjustments.has(group.groupKey)) {
      groupAdjustments.set(group.groupKey, 0);
      console.log(`[adjustBreakHeightsVertical] Group ${group.groupKey} has no overlaps, no adjustment`);
    }
  });
  
  // Debug: Log all group adjustments
  console.log(`[adjustBreakHeightsVertical] Group adjustments map:`, 
    Array.from(groupAdjustments.entries()).map(([key, adj]) => `${key}: ${adj.toFixed(1)}`));
  
  // Apply adjustments to all links in each group
  // Use consistent drop point key calculation
  return links.map(link => {
    // Find the drop point key for this link using the same function
    const dropPointKey = getDropPointKey(link);
    if (!dropPointKey) {
      console.log(`[adjustBreakHeightsVertical] Link ${link.id}: no drop point key found`);
      return link;
    }
    
    const adjustment = groupAdjustments.get(dropPointKey);
    console.log(`[adjustBreakHeightsVertical] Link ${link.id}: dropPointKey=${dropPointKey}, adjustment=${adjustment !== undefined ? adjustment.toFixed(1) : 'undefined'}`);
    
    if (adjustment === undefined || adjustment === 0) {
      if (adjustment === 0) {
        console.log(`[adjustBreakHeightsVertical] Link ${link.id} in group ${dropPointKey}: no adjustment (0)`);
      } else {
        console.log(`[adjustBreakHeightsVertical] Link ${link.id} in group ${dropPointKey}: adjustment undefined (group not found in adjustments map)`);
      }
      return link;
    }
    
    console.log(`[adjustBreakHeightsVertical] Applying adjustment to link ${link.id} in group ${dropPointKey}: ${adjustment.toFixed(1)}px`);
    
    // Create a new link with adjusted path data
    const adjustedLink: Link = {
      ...link,
      d: link.d.map((point, i) => {
        // Points at indices 1, 2, 3, 4 have the hy Y coordinate
        if (i >= 1 && i <= 4 && point[1] !== undefined) {
          const newY = point[1] + adjustment;
          console.log(`[adjustBreakHeightsVertical] Link ${link.id} point ${i}: Y ${point[1].toFixed(1)} -> ${newY.toFixed(1)}`);
          return [point[0], newY] as [number, number];
        }
        return point;
      }),
      _d: link._d ? () => {
        const path = link._d();
        return path.map((point, i) => {
          if (i >= 1 && i <= 4 && point[1] !== undefined) {
            return [point[0], point[1] + adjustment] as [number, number];
          }
          return point;
        });
      } : link._d
    };
    
    return adjustedLink;
  });
}

/**
 * Adjust break positions for horizontal layout (mirrors vertical logic)
 */
function adjustOverlappingLinkBreaksHorizontal(links: Link[], tree: Tree): Link[] {
  // Group links by their shared drop point Y coordinate
  const dropPointGroups = new Map<string, BreakSegment[]>();
  
  links.forEach(link => {
    if (!link.curve || link.spouse) return;
    
    const segment = extractBreakSegmentHorizontal(link);
    if (!segment) return;
    
    // Group by drop point Y coordinate (rounded to nearest pixel)
    const dropPointY = Math.round(segment.yMax); // Parent connection point
    const groupKey = `drop-${dropPointY}`;
    
    if (!dropPointGroups.has(groupKey)) {
      dropPointGroups.set(groupKey, []);
    }
    dropPointGroups.get(groupKey)!.push(segment);
  });
  
  if (dropPointGroups.size <= 1) {
    return links;
  }
  
  const allSegments: BreakSegment[] = [];
  dropPointGroups.forEach(segments => {
    allSegments.push(...segments);
  });
  
  return adjustBreakHeightsHorizontal(links, allSegments, dropPointGroups);
}

/**
 * Extract break segment information from a horizontal layout link
 */
function extractBreakSegmentHorizontal(link: Link): BreakSegment | null {
  // LinkHorizontal creates: [d.x, d.y], [hx, d.y], [hx, d.y], [hx, p.y], [hx, p.y], [p.x, p.y]
  // The break is at hx, spanning from min(d.y, p.y) to max(d.y, p.y)
  
  if (!link.d || link.d.length < 6) return null;
  
  const hx = link.d[1]?.[0];
  if (hx === undefined || isNaN(hx)) return null;
  
  const yCoords = link.d.map(p => p[1]).filter(y => y !== undefined && !isNaN(y)) as number[];
  if (yCoords.length === 0) return null;
  
  const yMin = Math.min(...yCoords);
  const yMax = Math.max(...yCoords);
  
  const xCoords = link.d.map(p => p[0]).filter(x => x !== undefined && !isNaN(x)) as number[];
  if (xCoords.length === 0) return null;
  const xMin = Math.min(...xCoords);
  const xMax = Math.max(...xCoords);
  
  // Get drop point key from link structure
  let dropPointKey: string | null = null;
  const dropPointY = Math.round(yMax); // Parent connection point
  dropPointKey = `drop-${dropPointY}`;
  
  return {
    link,
    hy: 0, // Not used for horizontal
    hx,
    xMin,
    xMax,
    yMin,
    yMax,
    dropPointKey
  };
}

/**
 * Adjust break positions for horizontal layout to prevent overlaps
 * Groups links by their shared drop point and adjusts group positions together
 */
function adjustBreakHeightsHorizontal(links: Link[], segments: BreakSegment[], dropPointGroups: Map<string, BreakSegment[]>): Link[] {
  // Use the drop point groups that were already created
  const segmentsByGroup = dropPointGroups;
  
  // Calculate representative break position for each group (use average)
  interface GroupInfo {
    groupKey: string;
    avgHx: number;
    yMin: number;
    yMax: number;
    segments: BreakSegment[];
  }
  
  const groupInfos: GroupInfo[] = [];
  segmentsByGroup.forEach((groupSegments, groupKey) => {
    const avgHx = groupSegments.reduce((sum, s) => sum + s.hx, 0) / groupSegments.length;
    const yMin = Math.min(...groupSegments.map(s => s.yMin));
    const yMax = Math.max(...groupSegments.map(s => s.yMax));
    groupInfos.push({
      groupKey,
      avgHx,
      yMin,
      yMax,
      segments: groupSegments
    });
  });
  
  // Sort groups by Y position and then by X
  groupInfos.sort((a, b) => {
    const yDiff = a.yMin - b.yMin;
    if (Math.abs(yDiff) > 1) return yDiff;
    return a.avgHx - b.avgHx;
  });
  
  // Group groups that overlap in Y range
  const overlapGroups: GroupInfo[][] = [];
  let currentOverlapGroup: GroupInfo[] = [];
  
  groupInfos.forEach(groupInfo => {
    if (currentOverlapGroup.length === 0) {
      currentOverlapGroup.push(groupInfo);
    } else {
      const overlaps = currentOverlapGroup.some(g => {
        const yOverlap = !(groupInfo.yMax < g.yMin - 5 || groupInfo.yMin > g.yMax + 5);
        const xClose = Math.abs(groupInfo.avgHx - g.avgHx) < 15;
        return yOverlap && xClose;
      });
      
      if (overlaps) {
        currentOverlapGroup.push(groupInfo);
      } else {
        overlapGroups.push(currentOverlapGroup);
        currentOverlapGroup = [groupInfo];
      }
    }
  });
  if (currentOverlapGroup.length > 0) {
    overlapGroups.push(currentOverlapGroup);
  }
  
  // Adjust positions for each overlap group
  // Strategy: Keep leftmost and rightmost groups at original positions, adjust center groups
  const MIN_SEPARATION = 20;
  const groupAdjustments = new Map<string, number>(); // groupKey -> adjustment amount
  
  overlapGroups.forEach(overlapGroup => {
    if (overlapGroup.length <= 1) return;
    
    // Sort by Y position to identify top, center, bottom
    overlapGroup.sort((a, b) => a.yMin - b.yMin);
    
    // Identify topmost and bottommost groups
    const topmost = overlapGroup[0];
    const bottommost = overlapGroup[overlapGroup.length - 1];
    
    // Keep topmost and bottommost at original positions
    groupAdjustments.set(topmost.groupKey, 0);
    if (overlapGroup.length > 1) {
      groupAdjustments.set(bottommost.groupKey, 0);
    }
    
    // For center groups (if any), adjust to avoid overlaps
    if (overlapGroup.length > 2) {
      const centerGroups = overlapGroup.slice(1, -1); // All groups except first and last
      
      // Sort center groups by X position (original position)
      centerGroups.sort((a, b) => a.avgHx - b.avgHx);
      
      // Find the baseline X position we need to avoid (max of topmost and bottommost)
      const baselineX = Math.max(topmost.avgHx, bottommost.avgHx);
      
      // Adjust center groups from baseline
      let currentX = baselineX + MIN_SEPARATION;
      centerGroups.forEach(groupInfo => {
        const targetX = Math.max(currentX, groupInfo.avgHx + MIN_SEPARATION);
        const adjustment = targetX - groupInfo.avgHx;
        
        groupAdjustments.set(groupInfo.groupKey, adjustment);
        currentX = targetX + MIN_SEPARATION;
      });
    }
  });
  
  // Apply adjustments to all links in each group
  return links.map(link => {
    // Find the drop point key for this link (horizontal layout)
    let dropPointKey: string | null = null;
    if (link.d && link.d.length >= 6) {
      const yMax = Math.max(...link.d.map(p => p[1]).filter(y => y !== undefined && !isNaN(y)) as number[]);
      dropPointKey = `drop-${Math.round(yMax)}`;
    } else {
      return link;
    }
    
    const adjustment = groupAdjustments.get(dropPointKey);
    if (adjustment === undefined || adjustment === 0) {
      return link;
    }
    
    const adjustedLink: Link = {
      ...link,
      d: link.d.map((point, i) => {
        // Points at indices 1, 2, 3, 4 have the hx X coordinate
        if (i >= 1 && i <= 4 && point[0] !== undefined) {
          return [point[0] + adjustment, point[1]] as [number, number];
        }
        return point;
      }),
      _d: link._d ? () => {
        const path = link._d();
        return path.map((point, i) => {
          if (i >= 1 && i <= 4 && point[0] !== undefined) {
            return [point[0] + adjustment, point[1]] as [number, number];
          }
          return point;
        });
      } : link._d
    };
    
    return adjustedLink;
  });
}

