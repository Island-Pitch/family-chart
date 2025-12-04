/**
 * Simple decoration system for family charts
 * Applies CSS classes for relationship statuses and replaces married links with double lines
 * Based on metadata in relationshipStatuses
 */

import * as d3 from "d3";
import { getRelationshipStatus, getPastPartnerRelationshipStatus, drawSlash } from './family-chart-utils.js';

/**
 * Initialize decoration system for a family chart
 */
export function initializeAdvancedDecorations(f3Chart, allData) {
  f3Chart._allData = allData;
  
  const getAllData = () => allData || f3Chart._allData || [];
  
  function cleanupDecorations() {
    const svg = f3Chart.svg;
    if (!svg) return;
    
    // Remove second married line paths
    d3.select(svg).selectAll('path.link.married-line-2').remove();
    
    // Remove decoration groups for X, /, and //
    d3.select(svg).selectAll('g.link-decoration').remove();
    
    // Remove status classes from links
    // NOTE: We do NOT reset stroke attributes here because:
    // 1. The base library will set stroke="#fff" in linkEnter anyway
    // 2. Resetting to null can cause issues with transitions
    // 3. applyDecorations will set the correct stroke after links are rendered
    d3.select(svg).selectAll('path.link').each(function() {
      const link = d3.select(this);
      
      // Remove status classes only
      link.classed('edge--married', false)
          .classed('married-line-1', false)
          .classed('edge--divorced', false)
          .classed('edge--separated', false)
          .classed('edge--widowed', false)
          .classed('edge--unknown', false)
          .classed('edge--adopted', false);
      
      // Remove unused __marriedLine property
      if (this.__marriedLine) {
        delete this.__marriedLine;
      }
    });
  }
  
  f3Chart.cleanupDecorations = cleanupDecorations;
  
  // Override updateTree to apply decorations after links are rendered
  const originalUpdateTree = f3Chart.updateTree.bind(f3Chart);
  let decorationTimeout = null;
  
  f3Chart.updateTree = function(props) {
    if (props && props.data) {
      f3Chart._allData = props.data;
    }
    
    // Clear any pending decoration application to prevent race conditions
    if (decorationTimeout) {
      clearTimeout(decorationTimeout);
      decorationTimeout = null;
    }
    
    // Clean up decorations IMMEDIATELY and SYNCHRONOUSLY before tree update
    // This ensures old decorations are removed before new ones are applied
    cleanupDecorations();
    
    const result = originalUpdateTree(props);
    
    // Apply decorations after links are rendered and transitions complete
    // For initial load, wait for transition_time to complete
    // For updates, use longer delay to ensure all transitions complete
    const transitionTime = f3Chart.transition_time || 1000;
    const delay = props?.initial ? transitionTime + 100 : transitionTime + 50;
    
    decorationTimeout = setTimeout(() => {
      applyDecorations();
      decorationTimeout = null;
    }, delay);
    
    return result;
  };
  
  /**
   * Apply decorations to all spouse links based on relationship status
   */
  function applyDecorations() {
    const svg = f3Chart.svg;
    if (!svg) {
      console.warn('[applyDecorations] No SVG found');
      return;
    }
    
    // Get the data to use for relationship lookups
    const dataToUse = getAllData();
    
    const linksView = d3.select(svg).select('.links_view');
    if (linksView.empty()) return;
    
    // Get all links, not just spouse links
    const allLinks = linksView.selectAll('path.link');
    
    allLinks.each(function() {
      const linkElement = d3.select(this);
      const linkPath = this;
      const d = linkElement.datum();
      
      // CRITICAL: Set default black stroke for ALL links first
      // This ensures parent-child and other non-spouse links are black
      linkElement
        .interrupt('stroke') // Stop any ongoing stroke transitions
        .attr('stroke', '#090909') // Default black color - override base library's #fff
        .style('stroke', '#090909') // Also set via style to ensure it's applied
        .attr('stroke-width', '6')
        .style('stroke-width', '6')
        .attr('stroke-linecap', 'round')
        .style('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('stroke-linejoin', 'round')
        .attr('fill', 'none')
        .style('fill', 'none');
      
      // Handle parent-child links (adoption styling)
      if (!d.spouse) {
        // Link structure varies:
        // - Progeny (parent->child): source=parent TreeDatum, target=child TreeDatum
        // - Ancestry (child->parent): source=child TreeDatum, target=parent TreeDatum or [parent1, parent2]
        
        // Extract IDs from source and target, handling arrays
        const getNodeId = (node) => {
          if (Array.isArray(node)) {
            // If array, get first element
            const firstNode = node[0];
            return firstNode?.data?.id || firstNode?.id || firstNode?.data?.data?.id;
          }
          return node?.data?.id || node?.id || node?.data?.data?.id;
        };
        
        const sourceId = getNodeId(d.source);
        const targetId = getNodeId(d.target);
        
        if (!sourceId || !targetId) {
          // Can't determine IDs, skip
          return;
        }
        
        // Get both nodes from allData
        const sourceInAllData = dataToUse.find(p => p.id === sourceId);
        const targetInAllData = dataToUse.find(p => p.id === targetId);
        
        // Check both directions to find adoption and determine parent/child
        // We'll check relationshipStatuses in both directions
        let parentId, childId, parentInAllData, childInAllData;
        let adoptedFromParentRelationship = false;
        let adoptedFromChildRelationship = false;
        
        if (sourceInAllData && targetInAllData) {
          // Get relationshipStatuses from both nodes
          let sourceRelStatuses = sourceInAllData.data?.relationshipStatuses || 
                                  sourceInAllData.data?.data?.relationshipStatuses;
          let targetRelStatuses = targetInAllData.data?.relationshipStatuses || 
                                  targetInAllData.data?.data?.relationshipStatuses;
          
          // Parse if strings
          if (typeof sourceRelStatuses === 'string') {
            try { sourceRelStatuses = JSON.parse(sourceRelStatuses); } catch (e) { sourceRelStatuses = null; }
          }
          if (typeof targetRelStatuses === 'string') {
            try { targetRelStatuses = JSON.parse(targetRelStatuses); } catch (e) { targetRelStatuses = null; }
          }
          
          // Check if source has target as child (source is parent, target is child)
          if (sourceRelStatuses && typeof sourceRelStatuses === 'object' && sourceRelStatuses[targetId]) {
            const relStatus = sourceRelStatuses[targetId];
            if (relStatus?.side === 'child' || relStatus?.relation_type) {
              parentId = sourceId;
              childId = targetId;
              parentInAllData = sourceInAllData;
              childInAllData = targetInAllData;
              
              // Check for adoption
              if (relStatus?.relation_type === 'adoptive' || relStatus?.relation_type === 'adopted') {
                adoptedFromParentRelationship = true;
              }
            }
          }
          
          // Check if target has source as child (target is parent, source is child)
          if (!parentId && targetRelStatuses && typeof targetRelStatuses === 'object' && targetRelStatuses[sourceId]) {
            const relStatus = targetRelStatuses[sourceId];
            if (relStatus?.side === 'child' || relStatus?.relation_type) {
              parentId = targetId;
              childId = sourceId;
              parentInAllData = targetInAllData;
              childInAllData = sourceInAllData;
              
              // Check for adoption
              if (relStatus?.relation_type === 'adoptive' || relStatus?.relation_type === 'adopted') {
                adoptedFromParentRelationship = true;
              }
            }
          }
          
          // Also check child's view of parent (child has parent with adoptive relation_type)
          if (childInAllData && parentId) {
            let childRelStatuses = childInAllData.data?.relationshipStatuses || 
                                   childInAllData.data?.data?.relationshipStatuses;
            if (typeof childRelStatuses === 'string') {
              try { childRelStatuses = JSON.parse(childRelStatuses); } catch (e) { childRelStatuses = null; }
            }
            
            if (childRelStatuses && typeof childRelStatuses === 'object' && childRelStatuses[parentId]) {
              const parentRelStatus = childRelStatuses[parentId];
              if (parentRelStatus?.relation_type === 'adoptive' || parentRelStatus?.relation_type === 'adopted') {
                adoptedFromChildRelationship = true;
              }
            }
          }
        }
        
        // Fallback: if we couldn't determine parent/child from relationshipStatuses, use default assumption
        if (!parentId || !childId) {
          // Default: source is child, target is parent (common for progeny links)
          childId = sourceId;
          parentId = targetId;
          childInAllData = sourceInAllData;
          parentInAllData = targetInAllData;
          
          // After fallback, check for adoption in relationshipStatuses
          if (parentInAllData && childId) {
            let parentRelStatuses = parentInAllData.data?.relationshipStatuses || 
                                    parentInAllData.data?.data?.relationshipStatuses;
            if (typeof parentRelStatuses === 'string') {
              try { parentRelStatuses = JSON.parse(parentRelStatuses); } catch (e) { parentRelStatuses = null; }
            }
            
            if (parentRelStatuses && typeof parentRelStatuses === 'object' && parentRelStatuses[childId]) {
              const childRelStatus = parentRelStatuses[childId];
              if (childRelStatus?.relation_type === 'adoptive' || childRelStatus?.relation_type === 'adopted') {
                adoptedFromParentRelationship = true;
              }
            }
          }
          
          if (childInAllData && parentId) {
            let childRelStatuses = childInAllData.data?.relationshipStatuses || 
                                  childInAllData.data?.data?.relationshipStatuses;
            if (typeof childRelStatuses === 'string') {
              try { childRelStatuses = JSON.parse(childRelStatuses); } catch (e) { childRelStatuses = null; }
            }
            
            if (childRelStatuses && typeof childRelStatuses === 'object' && childRelStatuses[parentId]) {
              const parentRelStatus = childRelStatuses[parentId];
              if (parentRelStatus?.relation_type === 'adoptive' || parentRelStatus?.relation_type === 'adopted') {
                adoptedFromChildRelationship = true;
              }
            }
          }
        }
        
        // If we still don't have valid IDs, skip this link
        if (!parentId || !childId || !parentInAllData || !childInAllData) {
          return;
        }
        
        // Extract child data structures for adoption flag checks
        const childData = childInAllData?.data || {};
        const childPersonData = childData?.data || childData;
        
        // Check adoption status from multiple possible locations
        // Use truthy check (not just === true) to handle various data formats
        // Also handle string "true" values
        
        // Helper to check if a value indicates adoption
        const checkAdopted = (val) => {
          if (val === true || val === 'true' || val === 1 || val === '1') return true;
          return false;
        };
        
        // 1. From the child's own adopted flag in data
        const adoptedFromTarget = checkAdopted(childPersonData?.adopted) || 
                                 checkAdopted(childData?.adopted) ||
                                 checkAdopted(childPersonData?.data?.adopted);
        
        // 2. From the allData array (child's own adopted flag in transformed data)
        const adoptedFromAllData = checkAdopted(childInAllData?.data?.adopted);
        
        // 3. Also check if childInAllData exists and has the adoption flag anywhere
        const adoptedFromNested = checkAdopted(childInAllData?.data?.data?.adopted) ||
                                 checkAdopted(childInAllData?.adopted);
        
        // Note: adoptedFromParentRelationship and adoptedFromChildRelationship are already set above
        // when we determined parent/child from relationshipStatuses
        
        const isAdopted = adoptedFromTarget || adoptedFromAllData || adoptedFromNested || 
                         adoptedFromParentRelationship || adoptedFromChildRelationship;
        
        // Debug logging for adoption detection (check all parent-child links)
        if (process.env.NODE_ENV === 'development') {
          const childName = childInAllData?.data?.full_name || childPersonData?.full_name || childData?.full_name || 'unknown';
          if (childName.toLowerCase().includes('addy') || childName.toLowerCase().includes('girl')) {
            // Get relationship statuses for debugging (check both locations)
            let debugParentRelStatuses = parentInAllData?.data?.relationshipStatuses || 
                                        parentInAllData?.data?.data?.relationshipStatuses;
            let debugChildRelStatuses = childInAllData?.data?.relationshipStatuses || 
                                       childInAllData?.data?.data?.relationshipStatuses;
            
            // Parse if string
            if (typeof debugParentRelStatuses === 'string') {
              try {
                debugParentRelStatuses = JSON.parse(debugParentRelStatuses);
              } catch (e) {
                debugParentRelStatuses = null;
              }
            }
            if (typeof debugChildRelStatuses === 'string') {
              try {
                debugChildRelStatuses = JSON.parse(debugChildRelStatuses);
              } catch (e) {
                debugChildRelStatuses = null;
              }
            }
            
            const parentChildRelStatus = debugParentRelStatuses && typeof debugParentRelStatuses === 'object' ? debugParentRelStatuses[childId] : null;
            const childParentRelStatus = debugChildRelStatuses && typeof debugChildRelStatuses === 'object' ? debugChildRelStatuses[parentId] : null;
            
            console.log('[applyDecorations] Adoption check for child:', {
              childId,
              childName,
              parentId,
              parentName: parentInAllData?.data?.full_name || 'unknown',
              childPersonDataAdopted: childPersonData?.adopted,
              childDataAdopted: childData?.adopted,
              childPersonDataDataAdopted: childPersonData?.data?.adopted,
              adoptedFromTarget,
              adoptedFromAllData,
              adoptedFromNested,
              adoptedFromParentRelationship,
              adoptedFromChildRelationship,
              isAdopted,
              hasChildInAllData: !!childInAllData,
              hasParentInAllData: !!parentInAllData,
              childInAllDataAdopted: childInAllData?.data?.adopted,
              parentChildRelStatus: parentChildRelStatus, // Parent's view of relationship
              childParentRelStatus: childParentRelStatus, // Child's view of relationship
              parentRelStatusesType: typeof debugParentRelStatuses,
              childRelStatusesType: typeof debugChildRelStatuses,
              parentHasRelStatuses: !!debugParentRelStatuses,
              childHasRelStatuses: !!debugChildRelStatuses,
              parentRelStatusesKeys: debugParentRelStatuses && typeof debugParentRelStatuses === 'object' ? Object.keys(debugParentRelStatuses) : [],
              childRelStatusesKeys: debugChildRelStatuses && typeof debugChildRelStatuses === 'object' ? Object.keys(debugChildRelStatuses) : [],
              childInAllDataDataKeys: childInAllData?.data ? Object.keys(childInAllData.data) : []
            });
          }
        }
        
        // Stroke is already set to black above, just add adoption styling if needed
        if (isAdopted) {
          linkElement.classed('edge--adopted', true)
            .interrupt('stroke') // Stop any ongoing stroke transitions
            .attr('stroke', '#090909') // Dark color matching Figma design
            .style('stroke', '#090909') // Also set via style to ensure it's applied
            .attr('stroke-width', '6')
            .style('stroke-width', '6')
            .attr('stroke-dasharray', '12 12') // Dotted pattern matching Figma design
            .style('stroke-dasharray', '12 12')
            .attr('stroke-linecap', 'round')
            .style('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .style('stroke-linejoin', 'round');
        }
        // Parent-child links are done - they have black stroke now
        return;
      }
      
      // Handle spouse links (married lines, past relationships, etc.)
      // Get relationship status from metadata for spouse links
      // Check for chained relationship status first (for chain links between past partners)
      let relationshipStatus = d.chainedRelationshipStatus;
      
      if (!relationshipStatus) {
        // For direct spouse links, getRelationshipStatus already checks both directions
        relationshipStatus = getRelationshipStatus(d.source, d.target, dataToUse) ||
                            getPastPartnerRelationshipStatus(d.source, d.target, dataToUse);
      }
      
      // If no relationship status found, stroke is already set to black above, just return
      // (spouse links without status should still be black, not white)
      if (!relationshipStatus) {
        return;
      }
      
      // Check link visibility
      let linkOpacity = 1;
      try {
        const computedStyle = window.getComputedStyle(linkPath);
        linkOpacity = parseFloat(computedStyle.opacity || '1');
        if (isNaN(linkOpacity)) linkOpacity = 1;
      } catch (e) {
        linkOpacity = 1;
      }
      
      if (linkOpacity < 0.1) return; // Link not visible
      
      // Get link path points - use the link data structure directly for spouse links
      const linkData = linkElement.datum();
      let startPoint, endPoint;
      
      // For spouse links (curve: false), use the data directly
      if (linkData.spouse && linkData.d && Array.isArray(linkData.d) && linkData.d.length >= 2) {
        // Spouse links are straight lines: [[x1, y1], [x2, y2]]
        const [start, end] = linkData.d;
        startPoint = { x: start[0], y: start[1] };
        endPoint = { x: end[0], y: end[1] };
      } else {
        // For curved links, use path length
        const pathLength = linkPath.getTotalLength();
        if (pathLength === 0) return;
        startPoint = linkPath.getPointAtLength(0);
        endPoint = linkPath.getPointAtLength(pathLength);
      }
      
      // Apply CSS class and handle decorations based on status
      if (relationshipStatus === 'married') {
        // ONLY married gets double lines (not partnered)
        console.log(`[applyDecorations] Applying married lines for ${d.source.data?.id || d.source.id} <-> ${d.target.data?.id || d.target.id}`);
        applyMarriedLines(linkElement, linkPath, linkData, startPoint, endPoint);
      } else if (relationshipStatus === 'divorced' || relationshipStatus === 'separated' || relationshipStatus === 'widowed') {
        // Special statuses: Add CSS class, set stroke color, and create decoration (X, /, or //)
        console.log(`[applyDecorations] Applying ${relationshipStatus} decoration for ${d.source.data?.id || d.source.id} <-> ${d.target.data?.id || d.target.id}`);
        linkElement
          .interrupt('stroke') // Stop any ongoing stroke transitions
          .classed(`edge--${relationshipStatus}`, true)
          .attr('stroke', '#AEB8C7') // Grey color for past relationships (matches example page)
          .style('stroke', '#AEB8C7') // Also set via style to ensure it's applied
          .attr('stroke-width', '6')
          .style('stroke-width', '6')
          .attr('stroke-linecap', 'round')
          .style('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .style('stroke-linejoin', 'round')
          .attr('fill', 'none')
          .style('fill', 'none');
        applyStatusDecoration(linkElement, linkPath, linkData, startPoint, endPoint, relationshipStatus);
      } else {
        // Standard links: Check confirmed flag for color
        // Get relationship status object to check confirmed flag
        const sourceId = d.source?.data?.id || d.source?.id;
        const targetId = d.target?.data?.id || d.target?.id;
        
        let isConfirmed = false;
        if (sourceId && targetId) {
          const sourcePerson = dataToUse.find(p => p.id === sourceId);
          const targetPerson = dataToUse.find(p => p.id === targetId);
          
          if (sourcePerson) {
            let sourceRelStatuses = sourcePerson.data?.relationshipStatuses || {};
            if (typeof sourceRelStatuses === 'string') {
              try { sourceRelStatuses = JSON.parse(sourceRelStatuses); } catch (e) { sourceRelStatuses = {}; }
            }
            const relStatus = sourceRelStatuses[targetId];
            if (relStatus && relStatus.confirmed === true) {
              isConfirmed = true;
            }
          }
          
          // Also check target's view of the relationship
          if (!isConfirmed && targetPerson) {
            let targetRelStatuses = targetPerson.data?.relationshipStatuses || {};
            if (typeof targetRelStatuses === 'string') {
              try { targetRelStatuses = JSON.parse(targetRelStatuses); } catch (e) { targetRelStatuses = {}; }
            }
            const relStatus = targetRelStatuses[sourceId];
            if (relStatus && relStatus.confirmed === true) {
              isConfirmed = true;
            }
          }
        }
        
        // Set color based on confirmed flag
        const strokeColor = isConfirmed ? '#090909' : '#AEB8C7'; // Black if confirmed, grey if not
        
        linkElement
          .interrupt('stroke')
          .classed(`edge--${relationshipStatus || 'standard'}`, true)
          .attr('stroke', strokeColor)
          .style('stroke', strokeColor)
          .attr('stroke-width', '6')
          .style('stroke-width', '6')
          .attr('stroke-linecap', 'round')
          .style('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .style('stroke-linejoin', 'round')
          .attr('fill', 'none')
          .style('fill', 'none');
      }
    });
  }
  
  /**
   * Apply CSS-based double lines for married relationships
   * Offsets original path to one side and creates second path on other side
   */
  function applyMarriedLines(linkElement, linkPath, linkData, startPoint, endPoint) {
    // Check if already processed
    if (linkElement.classed('edge--married')) return;
    
    // Calculate perpendicular offset for parallel lines
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const separation = 12; // 12px between lines (increased for visibility)
    const halfSep = separation / 2;
    
    // Calculate offsets for both lines (one on each side of center)
    const start1 = { x: startPoint.x - nx * halfSep, y: startPoint.y - ny * halfSep };
    const end1 = { x: endPoint.x - nx * halfSep, y: endPoint.y - ny * halfSep };
    const start2 = { x: startPoint.x + nx * halfSep, y: startPoint.y + ny * halfSep };
    const end2 = { x: endPoint.x + nx * halfSep, y: endPoint.y + ny * halfSep };
    
    // For spouse links (straight lines), create simple line paths
    // For curved links, we'd need to offset the entire path data array
    const isSpouseLink = linkData.spouse && !linkData.curve;
    
    if (isSpouseLink) {
      // Simple straight line - use d3.line() directly
      const line = d3.line().x(d => d.x).y(d => d.y);
      
      // Store the modified path data to prevent D3 from overwriting
      const modifiedLinkData1 = {
        ...linkData,
        d: [[start1.x, start1.y], [end1.x, end1.y]],
        _d: () => [[start1.x, start1.y], [end1.x, end1.y]]
      };
      const modifiedLinkData2 = {
        ...linkData,
        d: [[start2.x, start2.y], [end2.x, end2.y]],
        _d: () => [[start2.x, start2.y], [end2.x, end2.y]]
      };
      
      // Update original path to be offset to one side (first line)
      // Interrupt any ongoing transitions to prevent D3 from overwriting
      linkElement
        .interrupt('path') // Stop any ongoing path transitions
        .interrupt('stroke') // Stop any ongoing stroke transitions
        .classed('edge--married', true)
        .classed('married-line-1', true)
        .attr('stroke', '#090909') // Explicitly set stroke to override base library's #fff
        .style('stroke', '#090909') // Also set via style to ensure it's applied
        .attr('stroke-width', '6')
        .style('stroke-width', '6')
        .attr('stroke-linecap', 'round')
        .style('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('stroke-linejoin', 'round')
        .attr('fill', 'none')
        .style('fill', 'none')
        .datum(modifiedLinkData1) // Update datum to prevent D3 from overwriting
        .attr('d', line([start1, end1])); // Offset original path to one side
      
      // Get the link's parent and insert second path as sibling on other side
      const linkNode = linkElement.node();
      const parentNode = linkNode.parentNode;
      const nextSibling = linkNode.nextSibling;
      
      // Create second path element - styled with explicit attributes to match first line
      const secondPath = d3.select(parentNode).insert('path', nextSibling ? () => nextSibling : null)
        .datum(modifiedLinkData2) // Set datum to prevent D3 from overwriting
        .attr('d', line([start2, end2]))
        .attr('class', 'link edge--married married-line-2')
        .attr('stroke', '#090909') // Explicitly set stroke to match first line
        .style('stroke', '#090909') // Also set via style to ensure it's applied (overrides any CSS)
        .attr('stroke-width', '6')
        .style('stroke-width', '6')
        .attr('stroke-linecap', 'round')
        .style('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('stroke-linejoin', 'round')
        .attr('fill', 'none')
        .style('fill', 'none')
        .style('opacity', '1'); // Ensure it's visible
    } else {
      // For curved links (non-spouse links), we can't easily create parallel lines
      // Just apply the married class for CSS styling - the actual double line
      // would require offsetting all points in the curved path, which is complex
      linkElement
        .interrupt('path')
        .classed('edge--married', true)
        .classed('married-line-1', true);
      
      // Note: For curved links, we don't create a second parallel line
      // as it would require complex path offset calculations
    }
  }
  
  /**
   * Apply CSS-based decorations for relationship statuses (X, /, //)
   * Creates SVG elements positioned uniformly at the link midpoint
   * Uses same positioning logic as married lines for consistency
   */
  function applyStatusDecoration(linkElement, linkPath, linkData, startPoint, endPoint, status) {
    // Check if already processed
    const linkNode = linkElement.node();
    const parentNode = linkNode.parentNode;
    if (!parentNode) return;
    
    // Check if decoration already exists
    const siblings = Array.from(parentNode.children);
    const hasDecoration = siblings.some(sibling => {
      const siblingEl = d3.select(sibling);
      return siblingEl.classed('link-decoration') && 
             siblingEl.attr('data-status') === status &&
             siblingEl.attr('data-link-id') === (linkData.id || `${startPoint.x}-${startPoint.y}`);
    });
    if (hasDecoration) return;
    
    // Get source and target nodes for consistent Y positioning (same as married lines)
    const source = linkData.source;
    const target = linkData.target;
    const nodeSourceY = source?.y;
    const nodeTargetY = target?.y;
    
    // Calculate midpoint for decoration placement
    // For horizontal links, use node Y for consistency (same as married lines)
    const avgNodeY = (nodeSourceY !== undefined && nodeTargetY !== undefined && !isNaN(nodeSourceY) && !isNaN(nodeTargetY))
      ? (nodeSourceY + nodeTargetY) / 2
      : (startPoint.y + endPoint.y) / 2;
    const useNodeY = Math.abs((startPoint.y + endPoint.y) / 2) < 1 && avgNodeY !== undefined && !isNaN(avgNodeY) && Math.abs(avgNodeY) > 1;
    const decorationY = useNodeY ? avgNodeY : (startPoint.y + endPoint.y) / 2;
    
    const midPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: decorationY
    };
    
    // Calculate link angle for proper decoration orientation
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Get the link's parent and insert decoration group as sibling
    const nextSibling = linkNode.nextSibling;
    
    // Create decoration group - styled purely with CSS classes
    const decorationGroup = d3.select(parentNode).insert('g', nextSibling ? () => nextSibling : null)
      .attr('class', 'link-decoration')
      .attr('data-status', status)
      .attr('data-link-id', linkData.id || `${startPoint.x}-${startPoint.y}`)
      .attr('transform', `translate(${midPoint.x}, ${midPoint.y})`);
    
    // Decoration parameters (matching Figma design)
    const markAngleDeg = 35; // Angle of slashes relative to link
    const markLengthPx = 24; // Length of each slash
    const markSepPx = 16; // Separation between double slashes
    const slashStrokeWidth = 4; // Stroke width for slashes
    const color = '#AEB8C7'; // Grey color for past relationships
    
    if (status === 'divorced') {
      // Double slash (//): two parallel slashes
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, -markSepPx/2, markLengthPx, color, slashStrokeWidth);
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, markSepPx/2, markLengthPx, color, slashStrokeWidth);
    } else if (status === 'separated') {
      // Single slash (/): one slash
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, 0, markLengthPx, color, slashStrokeWidth);
    } else if (status === 'widowed') {
      // X symbol: two crossed slashes at 45° angles
      const size = 16;
      drawSlash(decorationGroup, {x: 0, y: 0}, angle + 45, 0, 0, size, color, 5);
      drawSlash(decorationGroup, {x: 0, y: 0}, angle - 45, 0, 0, size, color, 5);
    }
  }
  
  
}
