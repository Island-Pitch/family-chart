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
  
  // Group links by their shared drop point X coordinate (sx or parent midpoint)
  // Links that drop from the same point should have the same break height
  const dropPointGroups = new Map<string, BreakSegment[]>();
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
      console.log('[adjustOverlappingLinkBreaks] No segment extracted for link:', link.id);
      return;
    }
    
    // Group by drop point X coordinate using the same function as getDropPointKey
    const groupKey = getDropPointKey(link);
    if (!groupKey) {
      skippedLinks++;
      console.log(`[adjustOverlappingLinkBreaks] No drop point key for link: ${link.id}`);
      return;
    }
    
    // Store the dropPointKey in the segment for consistency
    segment.dropPointKey = groupKey;
    
    console.log(`[adjustOverlappingLinkBreaks] Link ${link.id}: groupKey=${groupKey}, is_ancestry=${link.is_ancestry}`);
    
    if (!dropPointGroups.has(groupKey)) {
      dropPointGroups.set(groupKey, []);
    }
    dropPointGroups.get(groupKey)!.push(segment);
    processedLinks++;
  });
  
  console.log(`[adjustOverlappingLinkBreaks] Processed ${processedLinks} links, skipped ${skippedLinks}`);
  console.log(`[adjustOverlappingLinkBreaks] Found ${dropPointGroups.size} drop point groups:`, 
    Array.from(dropPointGroups.keys()).map(key => `${key} (${dropPointGroups.get(key)!.length} links)`));
  
  // If only one group, no overlaps to resolve
  if (dropPointGroups.size <= 1) {
    console.log('[adjustOverlappingLinkBreaks] Only one drop point group, no adjustments needed');
    return links;
  }
  
  // Collect all break segments
  const allSegments: BreakSegment[] = [];
  dropPointGroups.forEach((segments, groupKey) => {
    const avgHy = segments.reduce((sum, s) => sum + s.hy, 0) / segments.length;
    console.log(`[adjustOverlappingLinkBreaks] Drop point group ${groupKey}: ${segments.length} segments, avgHy: ${avgHy.toFixed(1)}`);
    allSegments.push(...segments);
  });
  
  // Detect overlaps and adjust
  const adjustedLinks = adjustBreakHeightsVertical(links, allSegments, dropPointGroups);
  
  console.log(`[adjustOverlappingLinkBreaks] Adjusted ${adjustedLinks.length} links`);
  return adjustedLinks;
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
   */
  function adjustCluster(cluster: GroupInfo[]): Map<string, number> {
    const adjustments = new Map<string, number>();
    
    if (cluster.length === 1) {
      // Case 1: Single group - no adjustment needed
      adjustments.set(cluster[0].groupKey, 0);
      return adjustments;
    }
    
    if (cluster.length === 2) {
      // Case 2: Two groups overlap
      // Strategy: Keep the topmost (lowest Y value = highest on screen) at original height, adjust the other downward
      // In SVG coordinates, Y increases downward, so "downward" means increasing Y (making it less negative or more positive)
      const sortedByY = [...cluster].sort((a, b) => a.avgHy - b.avgHy);
      const topmost = sortedByY[0]; // Lowest Y value (highest on screen)
      const other = sortedByY[1];   // Higher Y value (lower on screen)
      
      adjustments.set(topmost.groupKey, 0);
      
      // Calculate target Y: ensure other is at least MIN_SEPARATION below topmost
      // In SVG, Y increases downward, so "below" means larger Y value (less negative or more positive)
      // Required minimum Y for other: topmost.avgHy + MIN_SEPARATION
      const requiredMinY = topmost.avgHy + MIN_SEPARATION;
      
      // If other is already at or below the required minimum, no adjustment needed
      // Otherwise, move it down to the required minimum
      let targetY: number;
      let adjustment: number;
      
      if (other.avgHy >= requiredMinY) {
        // Already properly separated, no adjustment needed
        targetY = other.avgHy;
        adjustment = 0;
        console.log(`[adjustBreakHeightsVertical] Case 2 (2 groups): ${topmost.groupKey} stays at ${topmost.avgHy.toFixed(1)}, ${other.groupKey} already at ${other.avgHy.toFixed(1)} (>= ${requiredMinY.toFixed(1)}), no adjustment`);
      } else {
        // Need to move other down to create separation
        targetY = requiredMinY;
        adjustment = targetY - other.avgHy;
        console.log(`[adjustBreakHeightsVertical] Case 2 (2 groups): ${topmost.groupKey} stays at ${topmost.avgHy.toFixed(1)}, ${other.groupKey} adjusted from ${other.avgHy.toFixed(1)} to ${targetY.toFixed(1)} (adjustment: ${adjustment.toFixed(1)})`);
      }
      
      adjustments.set(other.groupKey, adjustment);
      
      return adjustments;
    }
    
    // Case 3: 3+ groups overlap
    // Strategy: Sort by Y position (topmost first), keep topmost at original height, adjust all others downward
    const sortedByY = [...cluster].sort((a, b) => a.avgHy - b.avgHy);
    
    // Keep the topmost group (closest to top/highest) at its original height
    const topmost = sortedByY[0];
    adjustments.set(topmost.groupKey, 0);
    
    console.log(`[adjustBreakHeightsVertical] Case 3 (${cluster.length} groups): Topmost ${topmost.groupKey} stays at ${topmost.avgHy.toFixed(1)}`);
    
    // Adjust all other groups downward in order, maintaining MIN_SEPARATION between each
    // Start from the topmost's position and work downward
    let currentY = topmost.avgHy + MIN_SEPARATION;
    sortedByY.slice(1).forEach((groupInfo, idx) => {
      // Calculate target Y: ensure it's at least MIN_SEPARATION below the previous group
      // Always move down from currentY to maintain separation
      const targetY = currentY;
      const adjustment = targetY - groupInfo.avgHy;
      
      console.log(`[adjustBreakHeightsVertical]   Group ${idx + 2} (${groupInfo.groupKey}): hy ${groupInfo.avgHy.toFixed(1)} -> ${targetY.toFixed(1)} (adjustment: ${adjustment.toFixed(1)})`);
      adjustments.set(groupInfo.groupKey, adjustment);
      currentY = targetY + MIN_SEPARATION; // Next group goes below this one
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

