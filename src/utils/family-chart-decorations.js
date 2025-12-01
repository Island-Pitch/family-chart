/**
 * Advanced decoration system for family charts
 * Includes relationship status decorations, chained links, and adoption styling
 * Extracted from 12-figma-aligned-styling.html
 */

import * as d3 from "d3";
import { getRelationshipStatus, getPastPartnerRelationshipStatus, drawSlash } from './family-chart-utils.js';

/**
 * Initialize advanced decoration system for a family chart
 * This sets up relationship decorations, chained links, and adoption styling
 */
export function initializeAdvancedDecorations(f3Chart, allData) {
  // Track pending timeouts so we can cancel them when tree updates
  let pendingDecorationTimeout = null;
  let activeDecorationProcess = null;
  
  // Function to clean up all decorations immediately
  function cleanupDecorations() {
    const svg = f3Chart.svg;
    if (svg) {
      // Remove all decoration overlays immediately
      d3.select(svg).selectAll('g.link-overlays').remove();
      // Also remove any orphaned decoration groups
      d3.select(svg).selectAll('g[id^="decorations-"]').remove();
      // Remove any decoration lines that might be orphaned
      d3.select(svg).selectAll('line.link-overlay').remove();
      d3.select(svg).selectAll('line.slash').remove();
      // Remove parallel line overlays for married chained links
      d3.select(svg).selectAll('g.link-overlay-group[data-chain-link="true"]').remove();
      // Remove parallel line overlays for married spouse links
      d3.select(svg).selectAll('g.link-overlay-group[data-married-link="true"]').remove();
    }
    // Cancel any pending decoration timeouts
    if (pendingDecorationTimeout) {
      clearTimeout(pendingDecorationTimeout);
      pendingDecorationTimeout = null;
    }
    // Cancel any active decoration processes
    if (activeDecorationProcess) {
      if (activeDecorationProcess.interval) {
        clearInterval(activeDecorationProcess.interval);
      }
      if (activeDecorationProcess.timeout) {
        clearTimeout(activeDecorationProcess.timeout);
      }
      activeDecorationProcess = null;
    }
  }
  
  // Attach cleanup function to chart instance
  f3Chart.cleanupDecorations = cleanupDecorations;
  
  // Set up MutationObserver to continuously enforce hiding of replaced links
  // This prevents D3 transitions from making them visible again
  let marriedLinkObserver = null;
  function setupMarriedLinkObserver() {
    const svg = f3Chart.svg;
    if (!svg) return;
    
    // Disconnect existing observer if any
    if (marriedLinkObserver) {
      marriedLinkObserver.disconnect();
      marriedLinkObserver = null;
    }
    
    const linksView = d3.select(svg).select('.links_view');
    if (linksView.empty()) return;
    
    marriedLinkObserver = new MutationObserver(() => {
      // Find all links marked as replaced-by-married-lines and ensure they stay hidden
      const replacedLinks = d3.select(svg).selectAll('path.link.replaced-by-married-lines, path.link[data-replaced-by-married-lines="true"]');
      replacedLinks.each(function() {
        const linkNode = this;
        if (linkNode) {
          // Force hide using direct DOM manipulation
          linkNode.style.setProperty('opacity', '0', 'important');
          linkNode.style.setProperty('display', 'none', 'important');
          linkNode.style.setProperty('visibility', 'hidden', 'important');
          linkNode.style.setProperty('stroke', 'none', 'important');
          linkNode.style.setProperty('pointer-events', 'none', 'important');
        }
      });
    });
    
    // Observe the links view for attribute and style changes
    marriedLinkObserver.observe(linksView.node(), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'opacity', 'display', 'visibility', 'stroke']
    });
  }
  
  // Override updateTree to include cleanup and decoration setup
  const originalUpdateTree = f3Chart.updateTree.bind(f3Chart);
  f3Chart.updateTree = function(props) {
    // Clean up old decorations IMMEDIATELY and SYNCHRONOUSLY when tree updates
    cleanupDecorations();
    
    const result = originalUpdateTree(props);
    
    // Set up observer after tree updates
    requestAnimationFrame(() => {
      setupMarriedLinkObserver();
    });
    
    // Hook into link transitions - decorations will handle hiding married links
    // when they can successfully create the double lines
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hookIntoLinkTransitions();
      });
    });
    
    return result;
  };
  
  // For initial render, also hook into transitions
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hookIntoLinkTransitions();
    });
  });
  
  /**
   * Function to add decoration to a single link when its transition completes
   * @private - used internally by hookIntoLinkTransitions
   */
  function addDecorationForLink(linkElement, linkData) {
  // CRITICAL: Validate link data and element before proceeding
  if (!linkData || !linkData.source || !linkData.target) {
    return;
  }
  if (!linkElement || !linkElement.node() || !linkElement.node().parentNode) {
    return;
  }
  
  const source = linkData.source;
  const target = linkData.target;
  const sourceId = source.data?.id || source.id;
  const targetId = target.data?.id || target.id;
  
  if (!sourceId || !targetId) {
    return;
  }
  
  // Check if this link has already been processed (to prevent duplicate overlays)
  const checkLinkId = `decorations-${sourceId}-${targetId}`;
  const checkMarriedOverlayId = `married-overlay-${sourceId}-${targetId}`;
  const checkMarriedOverlayIdReverse = `married-overlay-${targetId}-${sourceId}`;
  const checkSvg = f3Chart.svg;
  const checkLinksView = d3.select(checkSvg).select('.links_view');
  
  // If overlay already exists and link is already hidden, skip processing
  const existingOverlay = checkLinksView.select(`g#${checkMarriedOverlayId}`).node() || 
                          checkLinksView.select(`g#${checkMarriedOverlayIdReverse}`).node();
  const isAlreadyHidden = linkElement.classed('replaced-by-married-lines') || 
                          linkElement.attr('data-replaced-by-married-lines') === 'true';
  
  if (existingOverlay && isAlreadyHidden) {
    // Already processed - verify the overlay still exists and has children
    const overlayGroup = d3.select(existingOverlay);
    const hasChildren = overlayGroup.selectAll('path.married-line-1, path.married-line-2').size() >= 2;
    if (hasChildren) {
      return; // Already processed correctly, skip
    } else {
      // Overlay exists but is empty - remove it and reprocess
      overlayGroup.remove();
    }
  }
  
  // Add data attributes to identify the link in the DOM for debugging
  linkElement
    .attr('data-source-id', sourceId)
    .attr('data-target-id', targetId)
    .attr('data-link-type', linkData.spouse ? 'spouse' : 'parent-child')
    .attr('data-is-chain-link', linkData.isChainLink ? 'true' : 'false');
  
  // CRITICAL: Verify nodes have valid positions before placing decorations
  const sourceX = source.x;
  const sourceY = source.y;
  const targetX = target.x;
  const targetY = target.y;
  
  // More lenient check - allow undefined during transitions, but check for NaN
  if ((sourceX !== undefined && isNaN(sourceX)) || 
      (sourceY !== undefined && isNaN(sourceY)) || 
      (targetX !== undefined && isNaN(targetX)) || 
      (targetY !== undefined && isNaN(targetY))) {
    return; // Nodes have NaN positions
  }
  
  // Check for extreme/obviously wrong positions
  const maxReasonablePos = 100000;
  if ((sourceX !== undefined && Math.abs(sourceX) > maxReasonablePos) || 
      (sourceY !== undefined && Math.abs(sourceY) > maxReasonablePos) ||
      (targetX !== undefined && Math.abs(targetX) > maxReasonablePos) || 
      (targetY !== undefined && Math.abs(targetY) > maxReasonablePos)) {
    return; // Positions are invalid/extreme
  }
  
  // Handle parent-child links for adoption
  if (!linkData.spouse) {
    const childData = target.data || target;
    const childPersonData = childData.data || childData;
    const childId = childData.id || target.id || target.data?.id;
    const childInAllData = allData.find(p => p.id === childId);
    const adoptedFromData = childInAllData?.data?.adopted === true;
    const isAdopted = childPersonData?.adopted === true || 
                     childData?.adopted === true ||
                     childPersonData?.data?.adopted === true ||
                     adoptedFromData;
    
    if (isAdopted) {
      linkElement.classed('edge--adopted', true);
      linkElement.attr('stroke', '#090909')
                 .attr('stroke-width', '6')
                 .attr('stroke-dasharray', '12 12')
                 .attr('stroke-linecap', 'round')
                 .attr('stroke-linejoin', 'round');
    }
    return;
  }
  
  // Handle spouse links for relationship decorations
  const isChainLink = linkData.isChainLink || linkData.chainedRelationshipStatus;
  let relationshipStatus;
  
  if (isChainLink) {
    relationshipStatus = linkData.chainedRelationshipStatus || 'separated';
  } else {
    relationshipStatus = getRelationshipStatus(source, target, allData);
    if (!relationshipStatus) {
      relationshipStatus = getPastPartnerRelationshipStatus(source, target, allData);
    }
    // DO NOT default to 'married' - only show double lines when explicitly married/partnered
    // If no status is found, the link will render as a normal single line
  }
  
  // Debug: Log relationship status detection for married links
  if (sourceId === 'elena' && targetId === 'alfred-sr' || sourceId === 'alfred-sr' && targetId === 'elena') {
    const sourcePerson = allData.find(p => p.id === sourceId);
    const targetPerson = allData.find(p => p.id === targetId);
    console.log('[addDecorationForLink] Elena-Alfred debug:', {
      sourceId,
      targetId,
      relationshipStatus,
      sourcePersonFound: !!sourcePerson,
      targetPersonFound: !!targetPerson,
      sourceRelStatuses: sourcePerson?.data?.relationshipStatuses,
      targetRelStatuses: targetPerson?.data?.relationshipStatuses,
      allDataLength: allData?.length
    });
  }
  
  // Check if this is a coparent relationship (they share children)
  // Even without relationshipStatus, coparents should show a line
  const sourcePerson = allData.find(p => p.id === sourceId);
  const targetPerson = allData.find(p => p.id === targetId);
  const isCoparent = sourcePerson && targetPerson && 
    sourcePerson.rels?.children && targetPerson.rels?.children &&
    sourcePerson.rels.children.some(childId => targetPerson.rels.children.includes(childId));
  
  // If no relationship status AND not a coparent, the link will render normally without decorations
  if (!relationshipStatus && !isCoparent) return;
  
  const linkPath = linkElement.node();
  if (!linkPath) return;
  
  const spouse = target;
  const mainPerson = source;
  const pathLength = linkPath.getTotalLength();
  
  const mainY = mainPerson.y;
  const spouseY = spouse.y;
  let edgeY;
  if (mainY !== undefined && mainY !== null && !isNaN(mainY)) {
    edgeY = mainY;
  } else if (spouseY !== undefined && spouseY !== null && !isNaN(spouseY)) {
    edgeY = spouseY;
  } else {
    const midPoint = linkPath.getPointAtLength(pathLength / 2);
    edgeY = midPoint.y;
  }
  
  let decorationX;
  if (isChainLink) {
    const midPoint = linkPath.getPointAtLength(pathLength / 2);
    decorationX = midPoint.x;
    edgeY = midPoint.y;
  } else {
    decorationX = spouse.sx;
    if (decorationX === undefined || isNaN(decorationX)) {
      const mainX = mainPerson.x || 0;
      const spouseX = spouse.x || 0;
      const dir = spouseX < mainX ? -1 : 1;
      const nodeSeparation = 200;
      decorationX = spouseX - dir * (nodeSeparation * 0.5);
    }
  }
  
  // CRITICAL: Validate decoration position before placing
  if (decorationX === undefined || isNaN(decorationX) || 
      edgeY === undefined || isNaN(edgeY) ||
      Math.abs(decorationX) > 100000 || Math.abs(edgeY) > 100000) {
    return; // Invalid decoration position, skip
  }
  
  // CRITICAL: Ensure the path is actually rendered before trying to get points
  if (!linkPath.getTotalLength || linkPath.getTotalLength() === 0) {
    return;
  }
  
  const decorationCenter = { x: decorationX, y: edgeY };
  const pointBefore = linkPath.getPointAtLength(Math.max(0, pathLength / 2 - 5));
  const pointAfter = linkPath.getPointAtLength(Math.min(pathLength, pathLength / 2 + 5));
  const dx = pointAfter.x - pointBefore.x;
  const dy = pointAfter.y - pointBefore.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  const linkId = `decorations-${sourceId}-${targetId}`;
  const svg = f3Chart.svg;
  const linksView = d3.select(svg).select('.links_view');
  
  // Remove existing decoration for this link if it exists (both old and new formats)
  linksView.select(`g#${linkId}`).remove();
  linksView.select(`g#married-overlay-${sourceId}-${targetId}`).remove();
  linksView.select(`g#married-overlay-${targetId}-${sourceId}`).remove();
  d3.select(svg).select(`g#${linkId}`).remove();
  d3.select(svg).select(`g#married-overlay-${sourceId}-${targetId}`).remove();
  d3.select(svg).select(`g#married-overlay-${targetId}-${sourceId}`).remove();
  
  // For married links, we'll create a separate overlay group below
  // For other decorations, use the standard overlay group
  let overlayGroup = null;
  if (relationshipStatus !== 'married' && relationshipStatus !== 'partnered') {
    overlayGroup = linksView.select(`g#${linkId}`);
    if (overlayGroup.empty()) {
      overlayGroup = linksView
        .append('g')
        .attr('id', linkId)
        .attr('class', 'link-overlays');
    }
    // CRITICAL: Apply transform to position the decoration group at the decoration center
    overlayGroup.attr('transform', `translate(${decorationCenter.x}, ${decorationCenter.y})`);
  }
  
  const baseWidth = 6;
  const markAngleDeg = 35;
  const markLengthPx = 24;
  const markSepPx = 16;
  const slashStrokeWidth = Math.max(2, baseWidth - 2);
  
  // Apply status-based styling to the link itself (for both regular and chained links)
  // Only apply double lines for explicitly married/partnered relationships
  // Do NOT apply for: null, undefined, 'divorced', 'separated', 'widowed', or any other status
  if (relationshipStatus === 'divorced') {
    linkElement.classed('edge--divorced', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'separated') {
    linkElement.classed('edge--separated', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'widowed') {
    linkElement.classed('edge--widowed', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'married' || relationshipStatus === 'partnered') {
    // ONLY apply double lines when status is explicitly 'married' or 'partnered'
    linkElement.classed('edge--married', true).attr('stroke', '#090909');
    // For married links, create double parallel lines matching Figma design
    // Use the link data's original coordinates for consistent positioning
    const pathNode = linkPath;
    const pathD = linkElement.attr('d');
    
    // Try to get coordinates from linkData first (most reliable)
    let startPoint, endPoint;
    if (linkData.d && Array.isArray(linkData.d) && linkData.d.length >= 2) {
      // Link data has array of [x, y] coordinates: [[x1, y1], [x2, y2], ...]
      const firstPoint = linkData.d[0];
      const lastPoint = linkData.d[linkData.d.length - 1];
      if (Array.isArray(firstPoint) && firstPoint.length >= 2 && 
          Array.isArray(lastPoint) && lastPoint.length >= 2) {
        startPoint = { x: firstPoint[0], y: firstPoint[1] };
        endPoint = { x: lastPoint[0], y: lastPoint[1] };
      }
    }
    
    // Fallback: Parse the path d attribute if linkData coordinates not available
    if (!startPoint || !endPoint) {
      if (pathD) {
        // Parse the path d attribute to extract start and end points
        // Format is typically "M x1,y1 L x2,y2" or "M x1,y1 L x2,y2 ..."
        const pathMatch = pathD.match(/M\s*([-\d.]+)\s*,?\s*([-\d.]+)\s*L\s*([-\d.]+)\s*,?\s*([-\d.]+)/);
        if (pathMatch) {
          startPoint = { x: parseFloat(pathMatch[1]), y: parseFloat(pathMatch[2]) };
          endPoint = { x: parseFloat(pathMatch[3]), y: parseFloat(pathMatch[4]) };
        }
      }
      
      // Final fallback: use getPointAtLength if path parsing fails
      if ((!startPoint || !endPoint) && pathNode && pathNode.getTotalLength && pathNode.getTotalLength() > 0) {
        const pathLength = pathNode.getTotalLength();
        const pt0 = pathNode.getPointAtLength(0);
        const ptEnd = pathNode.getPointAtLength(pathLength);
        startPoint = { x: pt0.x, y: pt0.y };
        endPoint = { x: ptEnd.x, y: ptEnd.y };
      }
    }
    
    if (!startPoint || !endPoint) {
      // If we can't determine path points, don't hide the link
      // Remove any previous marking so it can render normally
      if (linkElement.classed('replaced-by-married-lines')) {
        linkElement
          .classed('replaced-by-married-lines', false)
          .attr('data-replaced-by-married-lines', null)
          .style('opacity', null)
          .style('display', null)
          .style('visibility', null)
          .style('stroke', null)
          .style('pointer-events', null);
      }
      return; // Cannot determine path points - link will render normally
    }
    
    // Calculate the direction vector and its perpendicular (normal)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    
    // Normal vector (perpendicular to the line)
    const nx = -dy / length;
    const ny = dx / length;
    
    // Figma design: two parallel lines 9px apart (28.5 - 19.5 = 9px)
    const separation = 9;
    const halfSeparation = separation / 2; // 4.5px offset on each side
    
    // Create two parallel lines by offsetting the start and end points
    const start1 = { x: startPoint.x - nx * halfSeparation, y: startPoint.y - ny * halfSeparation };
    const end1 = { x: endPoint.x - nx * halfSeparation, y: endPoint.y - ny * halfSeparation };
    const start2 = { x: startPoint.x + nx * halfSeparation, y: startPoint.y + ny * halfSeparation };
    const end2 = { x: endPoint.x + nx * halfSeparation, y: endPoint.y + ny * halfSeparation };
    
    const overlayGroupId = `married-overlay-${sourceId}-${targetId}`;
    // Remove existing overlay if it exists
    linksView.select(`g#${overlayGroupId}`).remove();
    
    const overlayGroup = linksView.append('g')
      .attr('id', overlayGroupId)
      .attr('class', 'link-overlay-group')
      .attr('data-link-id', linkId)
      .attr('data-married-link', 'true');
    
    // Create simple line paths using the path's actual start/end points
    const line = d3.line().x(d => d.x).y(d => d.y);
    const pathString1 = line([start1, end1]);
    const pathString2 = line([start2, end2]);
    
    // Only proceed if we can create both paths
    if (!pathString1 || !pathString2) {
      // If we can't create double lines, ensure the original link is visible
      if (linkElement.classed('replaced-by-married-lines')) {
        linkElement
          .classed('replaced-by-married-lines', false)
          .attr('data-replaced-by-married-lines', null)
          .style('opacity', null)
          .style('display', null)
          .style('visibility', null)
          .style('stroke', null)
          .style('pointer-events', null);
      }
      return; // Cannot create double lines
    }
    
    // Create both parallel lines as overlays FIRST
    // Only hide the original link AFTER we successfully create the double lines
    const line1 = overlayGroup.append('path')
      .attr('d', pathString1)
      .attr('class', 'link married-line-1')
      .style('stroke', '#090909')
      .style('stroke-width', '6')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .style('fill', 'none')
      .style('opacity', 1);
    
    const line2 = overlayGroup.append('path')
      .attr('d', pathString2)
      .attr('class', 'link married-line-2')
      .style('stroke', '#090909')
      .style('stroke-width', '6')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .style('fill', 'none')
      .style('opacity', 1);
    
    // Verify both lines were created successfully
    if (!line1.node() || !line2.node()) {
      // If lines weren't created, remove the overlay group and restore the original link
      overlayGroup.remove();
      if (linkElement.classed('replaced-by-married-lines')) {
        linkElement
          .classed('replaced-by-married-lines', false)
          .attr('data-replaced-by-married-lines', null)
          .style('opacity', null)
          .style('display', null)
          .style('visibility', null)
          .style('stroke', null)
          .style('pointer-events', null);
      }
      return;
    }
    
    // NOW hide the original link completely - we've successfully created the double lines
    // Mark it with a class and data attribute for CSS targeting, then hide it aggressively
    // Use multiple methods to ensure it stays hidden even if D3 transitions try to override
    linkElement
      .classed('replaced-by-married-lines', true)
      .attr('data-replaced-by-married-lines', 'true');
    
    // Set it directly on the DOM node to override any D3 transitions
    const linkNode = linkElement.node();
    if (linkNode) {
      linkNode.style.setProperty('opacity', '0', 'important');
      linkNode.style.setProperty('display', 'none', 'important');
      linkNode.style.setProperty('visibility', 'hidden', 'important');
      linkNode.style.setProperty('stroke', 'none', 'important');
      linkNode.style.setProperty('pointer-events', 'none', 'important');
      linkNode.setAttribute('opacity', '0');
      linkNode.setAttribute('display', 'none');
      linkNode.setAttribute('stroke', 'none');
      
      // Also use D3 selection to set styles (in case DOM manipulation doesn't work)
      linkElement
        .style('opacity', '0')
        .style('display', 'none')
        .style('visibility', 'hidden')
        .style('stroke', 'none')
        .style('pointer-events', 'none')
        .attr('opacity', '0')
        .attr('display', 'none')
        .attr('stroke', 'none');
    }
    
    return;
  }
  
  // Draw decorations for past relationships (divorced, separated, widowed)
  if (relationshipStatus === 'divorced') {
    drawSlash(overlayGroup, {x: 0, y: 0}, angle, markAngleDeg, -markSepPx/2, markLengthPx, '#AEB8C7', slashStrokeWidth);
    drawSlash(overlayGroup, {x: 0, y: 0}, angle, markAngleDeg, markSepPx/2, markLengthPx, '#AEB8C7', slashStrokeWidth);
  } else if (relationshipStatus === 'separated') {
    drawSlash(overlayGroup, {x: 0, y: 0}, angle, markAngleDeg, 0, markLengthPx, '#AEB8C7', slashStrokeWidth);
  } else if (relationshipStatus === 'widowed') {
    const size = 16;
    drawSlash(overlayGroup, {x: 0, y: 0}, angle + 45, 0, 0, size, '#AEB8C7', 5);
    drawSlash(overlayGroup, {x: 0, y: 0}, angle - 45, 0, 0, size, '#AEB8C7', 5);
  }
}

  /**
   * Function to check if a node (card) has finished its transition
   */
  function isNodeTransitionComplete(nodeData) {
  if (!nodeData || !nodeData.source || !nodeData.target) {
    return false;
  }
  
  const sourceX = nodeData.source.x;
  const sourceY = nodeData.source.y;
  const targetX = nodeData.target.x;
  const targetY = nodeData.target.y;
  
  // Check for NaN (invalid) but allow undefined (still transitioning)
  const sourceHasValidPos = (sourceX === undefined || !isNaN(sourceX)) && 
                            (sourceY === undefined || !isNaN(sourceY));
  const targetHasValidPos = (targetX === undefined || !isNaN(targetX)) && 
                            (targetY === undefined || !isNaN(targetY));
  
  if (!sourceHasValidPos || !targetHasValidPos) {
    return false;
  }
  
  const hasSomePositions = (sourceX !== undefined || sourceY !== undefined) &&
                          (targetX !== undefined || targetY !== undefined);
  
  if (!hasSomePositions) {
    return false;
  }
  
  // For spouse links, require both x and y to be defined (not just "some positions")
  // This ensures the nodes are fully positioned before we try to create decorations
  if (nodeData.spouse) {
    const hasFullPositions = sourceX !== undefined && sourceY !== undefined &&
                            targetX !== undefined && targetY !== undefined;
    return hasFullPositions;
  }
  
  // For parent-child links, sx is helpful but not required
  if (nodeData.spouse) {
    const spouse = nodeData.target;
    const sx = spouse.sx;
    if (sx !== undefined && isNaN(sx)) {
      return false;
    }
  }
  
  // Get the actual DOM cards to verify they're in final positions
  const container = document.querySelector('#FamilyChart');
  if (container) {
    const cardContainers = container.querySelectorAll('div.card_cont');
    if (cardContainers.length > 0) {
      let foundMatchingCards = 0;
      cardContainers.forEach(cardCont => {
        const transform = cardCont.style.transform || '';
        if (transform.includes('translate') && transform.match(/\d+px/)) {
          foundMatchingCards++;
        }
      });
      return foundMatchingCards > 0;
    }
  }
  
  return true;
}

  /**
   * Create chained links between ALL partners (not just past partners)
   * This ensures all partners are connected in a chain, avoiding overlaps
   */
  function createChainedLinks() {
    const svg = f3Chart.svg;
  if (!svg) return;

  const linksView = d3.select(svg).select('.links_view');
  if (linksView.empty()) return;

  const allLinks = d3.select(svg).selectAll('path.link');
  const allPartnersByPerson = new Map();

  // Collect ALL spouse links, regardless of relationshipStatus
  allLinks.each(function(d) {
    if (!d || !d.spouse || !d.source || !d.target) return;
    
    const source = d.source;
    const target = d.target;
    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;
    
    if (!sourceId || !targetId) return;

    // Get relationship status if it exists
    const relationshipStatus = getRelationshipStatus(source, target, allData);
    
    // Determine which person is the "main" person (the one with multiple partners)
    // Use the person's rels.spouses array to determine this
    const sourcePerson = allData.find(p => p.id === sourceId);
    const targetPerson = allData.find(p => p.id === targetId);
    
    if (!sourcePerson || !targetPerson) return;
    
    // Determine main person: the one with more spouses (or if equal, use source)
    const sourceSpouseCount = sourcePerson?.rels?.spouses?.length || 0;
    const targetSpouseCount = targetPerson?.rels?.spouses?.length || 0;
    
    let mainPersonId, partnerId, partnerNode;
    
    if (sourceSpouseCount >= targetSpouseCount) {
      mainPersonId = sourceId;
      partnerId = targetId;
      partnerNode = target;
    } else {
      mainPersonId = targetId;
      partnerId = sourceId;
      partnerNode = source;
    }
    
    if (!allPartnersByPerson.has(mainPersonId)) {
      allPartnersByPerson.set(mainPersonId, []);
    }
    
    const isCurrent = relationshipStatus && ['married', 'partnered'].includes(relationshipStatus);
    const isPast = relationshipStatus && ['divorced', 'separated', 'widowed'].includes(relationshipStatus);
    
    const mainPerson = allData.find(p => p.id === mainPersonId);
    const spouseOrder = mainPerson?.rels?.spouses || [];
    const partnerIndex = spouseOrder.indexOf(partnerId);
    
    allPartnersByPerson.get(mainPersonId).push({
      id: partnerId,
      node: partnerNode,
      status: relationshipStatus || null,
      isCurrent: isCurrent,
      isPast: isPast,
      spouseOrder: partnerIndex >= 0 ? partnerIndex : 999
    });
  });

  // Create chained links between ALL consecutive past partners
  // Only show direct link to FIRST/MOST CURRENT partner (married/partnered)
  // Hide ALL direct links to past partners and chain them together
  allPartnersByPerson.forEach((allPartners, mainPersonId) => {
    // Separate current partners (married/partnered) from past partners
    const currentPartners = allPartners.filter(p => p.isCurrent);
    const pastPartners = allPartners.filter(p => !p.isCurrent);
    
    // If there are no past partners, nothing to chain
    if (pastPartners.length === 0) return;
    
    // Sort past partners by their order in the spouses array (or by x position)
    // Most recent past partner first, oldest last
    pastPartners.sort((a, b) => {
      if (a.spouseOrder !== b.spouseOrder && a.spouseOrder !== 999 && b.spouseOrder !== 999) {
        return a.spouseOrder - b.spouseOrder;
      }
      if (a.spouseOrder !== 999 && b.spouseOrder === 999) return -1;
      if (a.spouseOrder === 999 && b.spouseOrder !== 999) return 1;
      return (a.node.x || 0) - (b.node.x || 0);
    });
    
    // Hide ALL direct links from main person to past partners
    // Only the current partner (married/partnered) should have a direct link
    pastPartners.forEach(pastPartner => {
      const mainToPastPartnerLink = d3.select(svg).selectAll('path.link').filter(function(d) {
        if (!d || !d.spouse || !d.source || !d.target) return false;
        const sId = d.source?.data?.id || d.source?.id;
        const tId = d.target?.data?.id || d.target?.id;
        return (sId === mainPersonId && tId === pastPartner.id) ||
               (sId === pastPartner.id && tId === mainPersonId);
      });
      
      mainToPastPartnerLink.each(function(d) {
        const linkEl = d3.select(this);
        const relationshipStatus = getRelationshipStatus(d.source, d.target, allData);
        
        // Only hide if not married (married links are replaced by double lines)
        if (relationshipStatus !== 'married' && relationshipStatus !== 'partnered') {
          linkEl
            .classed('replaced-by-chain-link', true)
            .attr('data-replaced-by-chain-link', 'true')
            .style('opacity', '0')
            .style('display', 'none')
            .style('visibility', 'hidden')
            .style('stroke', 'none')
            .style('pointer-events', 'none');
        }
      });
    });
    
    // If there are 2+ past partners, create chain links between them
    if (pastPartners.length >= 2) {
      // Create links between consecutive past partners
      for (let i = 0; i < pastPartners.length - 1; i++) {
        const partner1 = pastPartners[i];
        const partner2 = pastPartners[i + 1];
        // Use 'separated' as default status for chained links between partners without explicit status
        const chainStatus = partner1.status || partner2.status || 'separated';
        
        // Check if link already exists (either as a spouse link or chained link)
        const existingLink = d3.select(svg).selectAll('path.link').filter(function(d) {
          if (!d || !d.source || !d.target) return false;
          const sId = d.source?.data?.id || d.source?.id;
          const tId = d.target?.data?.id || d.target?.id;
          return (sId === partner1.id && tId === partner2.id) ||
                 (sId === partner2.id && tId === partner1.id);
        });
        
        if (!existingLink.empty()) {
          existingLink.each(function(d) {
            d.chainedRelationshipStatus = chainStatus;
            d.isChainLink = true;
            // Mark as chain link so it gets proper styling
            const linkEl = d3.select(this);
            linkEl.attr('data-chain-link', 'true');
          });
          continue;
        }
        
        // Create a new chained link
        const linkId = `chain-${partner1.id}-${partner2.id}`;
        const x1 = partner1.node.x || 0;
        const y1 = partner1.node.y || 0;
        const x2 = partner2.node.x || 0;
        const y2 = partner2.node.y || 0;
        const pathData = [[x1, y1], [x2, y2]];
        
        const isPastRelationship = ['divorced', 'separated', 'widowed'].includes(chainStatus);
        const isMarried = chainStatus === 'married' || chainStatus === 'partnered';
        const strokeColor = isPastRelationship ? '#AEB8C7' : '#090909';
        const strokeWidth = 6;
        
        const linkPath = linksView
          .append('path')
          .attr('class', 'link')
          .attr('data-link-type', 'spouse')
          .attr('data-chain-link', 'true')
          .attr('data-marriage-status', chainStatus)
          .style('stroke', strokeColor)
          .style('stroke-width', strokeWidth)
          .style('stroke-linecap', 'round')
          .style('stroke-linejoin', 'round')
          .style('fill', 'none')
          .style('opacity', 0);
        
        const linkDatum = {
          d: pathData,
          _d: () => [[x1, y1], [x1, y1]],
          curve: false,
          source: partner1.node,
          target: partner2.node,
          spouse: true,
          isChainLink: true,
          chainedRelationshipStatus: chainStatus,
          id: linkId,
          depth: partner1.node.depth || 0
        };
        
        linkPath.datum(linkDatum);
        
        const line = d3.line();
        const pathString = line(pathData);
        if (pathString) {
          linkPath.attr('d', pathString);
        } else {
          linkPath.attr('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        }
        
        const transitionTime = 1000;
        linkPath.transition()
          .duration(transitionTime)
          .style('opacity', 1);
        
        // For married chained links, create double parallel lines
        if (isMarried) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const pathNode = linkPath.node();
            if (!pathNode || !pathNode.getTotalLength) return;
            
            const pathLength = pathNode.getTotalLength();
            if (pathLength === 0) return;
            
            const numSamples = Math.max(10, Math.floor(pathLength / 10));
            const points = [];
            for (let i = 0; i <= numSamples; i++) {
              const t = i / numSamples;
              const point = pathNode.getPointAtLength(t * pathLength);
              points.push(point);
            }
            
            // Figma design: two parallel lines 9px apart (28.5 - 19.5 = 9px)
            const separation = 9; // Total separation between lines
            const halfSeparation = separation / 2; // 4.5px offset on each side
            const offsetPoints1 = []; // First line (offset -4.5px)
            const offsetPoints2 = []; // Second line (offset +4.5px)
            
            for (let i = 0; i < points.length; i++) {
              let nx, ny;
              if (i === 0) {
                const dx = points[i + 1].x - points[i].x;
                const dy = points[i + 1].y - points[i].y;
                const len = Math.hypot(dx, dy) || 1;
                nx = -dy / len;
                ny = dx / len;
              } else if (i === points.length - 1) {
                const dx = points[i].x - points[i - 1].x;
                const dy = points[i].y - points[i - 1].y;
                const len = Math.hypot(dx, dy) || 1;
                nx = -dy / len;
                ny = dx / len;
              } else {
                const dx1 = points[i].x - points[i - 1].x;
                const dy1 = points[i].y - points[i - 1].y;
                const dx2 = points[i + 1].x - points[i].x;
                const dy2 = points[i + 1].y - points[i].y;
                const dx = (dx1 + dx2) / 2;
                const dy = (dy1 + dy2) / 2;
                const len = Math.hypot(dx, dy) || 1;
                nx = -dy / len;
                ny = dx / len;
              }
              
              // Create two lines: one at -4.5px, one at +4.5px (total 9px apart)
              offsetPoints1.push({
                x: points[i].x - nx * halfSeparation,
                y: points[i].y - ny * halfSeparation
              });
              offsetPoints2.push({
                x: points[i].x + nx * halfSeparation,
                y: points[i].y + ny * halfSeparation
              });
            }
            
            const overlayGroup = linksView.append('g')
              .attr('class', 'link-overlay-group')
              .attr('data-link-id', linkId)
              .attr('data-chain-link', 'true');
            
            const line = d3.line().x(d => d.x).y(d => d.y);
            const pathString1 = line(offsetPoints1);
            const pathString2 = line(offsetPoints2);
            
            // Hide the original chained link completely - we'll replace it with two parallel lines
            // Use multiple methods to ensure it's completely hidden
            d3.select(linkPath)
              .style('opacity', '0')
              .style('display', 'none')
              .style('visibility', 'hidden')
              .attr('opacity', '0')
              .attr('display', 'none');
            
            // Create both parallel lines as overlays to ensure clean rendering
            if (pathString1) {
              overlayGroup.append('path')
                .attr('d', pathString1)
                .attr('class', 'link married-line-1')
                .style('stroke', '#090909')
                .style('stroke-width', strokeWidth)
                .style('stroke-linecap', 'round')
                .style('stroke-linejoin', 'round')
                .style('fill', 'none')
                .style('opacity', 0)
                .transition()
                .duration(transitionTime)
                .style('opacity', 1);
            }
            
            if (pathString2) {
              overlayGroup.append('path')
                .attr('d', pathString2)
                .attr('class', 'link married-line-2')
                .style('stroke', '#090909')
                .style('stroke-width', strokeWidth)
                .style('stroke-linecap', 'round')
                .style('stroke-linejoin', 'round')
                .style('fill', 'none')
                .style('opacity', 0)
                .transition()
                .duration(transitionTime)
                .style('opacity', 1);
            }
          });
        });
        }
      }
    }
  });
}

  /**
   * Function to hook into individual link transitions
   * Uses polling to detect when each link AND its nodes finish animating
   */
  function hookIntoLinkTransitions() {
    const svg = f3Chart.svg;
    if (!svg) return;
    
    // Track active process
    let activeDecorationProcess = f3Chart._activeDecorationProcess;
    if (activeDecorationProcess) {
      clearInterval(activeDecorationProcess.interval);
      if (activeDecorationProcess.timeout) {
        clearTimeout(activeDecorationProcess.timeout);
      }
      activeDecorationProcess = null;
    }
    
    // Clean up any existing decorations before starting new process
    cleanupDecorations();
    
    // First, create chained links between past partners
    createChainedLinks();
    
    const links = d3.select(svg).selectAll('path.link');
    const processedLinks = new Set();
    const linkPathHistory = new Map();
    const linkStabilityCount = new Map();
    
    const processInfo = {
      interval: null,
      timeout: null,
      startTime: Date.now()
    };
    f3Chart._activeDecorationProcess = processInfo;
    activeDecorationProcess = processInfo;
    
    // Delayed immediate pass: Process married links after initial render completes
    // Use setTimeout with a small delay to ensure links are fully rendered and positioned
    // This fixes the issue where married lines don't appear on initial page load
    setTimeout(() => {
      // Process married links first (they're most important and should appear quickly)
      // This gives instant feedback for married relationships
      const currentLinks = d3.select(svg).selectAll('path.link');
      currentLinks.each(function(d) {
        if (!d || !d.source || !d.target) return;
        const sourceId = d.source?.data?.id || d.source?.id;
        const targetId = d.target?.data?.id || d.target?.id;
        if (!sourceId || !targetId) return;
        
        const relationshipStatus = getRelationshipStatus(d.source, d.target, allData);
        const isMarriedLink = relationshipStatus === 'married' || relationshipStatus === 'partnered';
        
        if (isMarriedLink) {
          const linkElement = d3.select(this);
          if (linkElement.node() && linkElement.node().parentNode) {
            const linkId = d.id || `${sourceId}-${targetId}`;
            const linkIdReverse = `${targetId}-${sourceId}`;
            
            // Check if already processed
            if (processedLinks.has(linkId) || processedLinks.has(linkIdReverse)) return;
            
            // Try to process - check if link is visible and has valid path
            // Use computed style for more accurate visibility detection (D3 transitions might not set inline opacity)
            const pathData = linkElement.attr('d');
            const hasPath = pathData && pathData !== 'M0,0' && pathData.length > 10;
            const linkNode = linkElement.node();
            let opacity = 1; // Default to visible
            if (linkNode) {
              try {
                const inlineOpacity = linkElement.style('opacity');
                const computedStyle = window.getComputedStyle(linkNode);
                const computedOpacity = computedStyle.opacity;
                // Prefer computed style (more accurate during transitions)
                opacity = parseFloat(computedOpacity || inlineOpacity || '1');
                // If opacity is NaN or invalid, default to 1 (visible)
                if (isNaN(opacity) || opacity < 0) opacity = 1;
              } catch (e) {
                // If we can't get computed style, assume visible
                opacity = 1;
              }
            }
            // For married links, be very lenient with visibility (they might be transitioning)
            const isVisible = opacity >= 0.1;
            
            // Also check if nodes have valid positions
            const sourceX = d.source.x;
            const sourceY = d.source.y;
            const targetX = d.target.x;
            const targetY = d.target.y;
            const hasValidPositions = sourceX !== undefined && sourceY !== undefined && 
                                     targetX !== undefined && targetY !== undefined &&
                                     !isNaN(sourceX) && !isNaN(sourceY) && 
                                     !isNaN(targetX) && !isNaN(targetY);
            
            if (hasPath && isVisible && hasValidPositions) {
              addDecorationForLink(linkElement, d);
              processedLinks.add(linkId);
              processedLinks.add(linkIdReverse);
            }
          }
        }
      });
    }, 100); // Small delay to ensure links are fully rendered
    
    // Poll for link AND node completion - check every 30ms for faster response
    processInfo.interval = setInterval(() => {
      if (f3Chart._activeDecorationProcess !== processInfo) {
        clearInterval(processInfo.interval);
        return;
      }
      
      const currentLinks = d3.select(svg).selectAll('path.link');
      const currentLinkCount = currentLinks.size();
      
      if (Math.abs(currentLinkCount - links.size()) > links.size() * 0.2) {
        clearInterval(processInfo.interval);
        f3Chart._activeDecorationProcess = null;
        return;
      }
      
      let allComplete = true;
      
      currentLinks.each(function(d) {
        if (!d || !d.source || !d.target) return;
        
        const sourceId = d.source?.data?.id || d.source?.id;
        const targetId = d.target?.data?.id || d.target?.id;
        const linkId = d.id || `${sourceId}-${targetId}`;
        const linkIdReverse = `${targetId}-${sourceId}`;
        
        // Check both linkId formats (source-target and target-source)
        if (processedLinks.has(linkId) || processedLinks.has(linkIdReverse)) return;
        
        const linkElement = d3.select(this);
        
        if (!linkElement.node() || !linkElement.node().parentNode) {
          return;
        }
        
        // For links that are already marked as replaced-by-married-lines, check if overlay exists
        const isMarkedAsReplaced = linkElement.classed('replaced-by-married-lines') || 
                                    linkElement.attr('data-replaced-by-married-lines') === 'true';
        if (isMarkedAsReplaced) {
          const marriedOverlayId = `married-overlay-${sourceId}-${targetId}`;
          const marriedOverlayIdReverse = `married-overlay-${targetId}-${sourceId}`;
          const svg = f3Chart.svg;
          const linksView = d3.select(svg).select('.links_view');
          const existingOverlay = linksView.select(`g#${marriedOverlayId}`).node() || 
                                  linksView.select(`g#${marriedOverlayIdReverse}`).node();
          if (existingOverlay) {
            // Overlay exists, verify it has children
            const overlayGroup = d3.select(existingOverlay);
            const hasChildren = overlayGroup.selectAll('path.married-line-1, path.married-line-2').size() >= 2;
            if (hasChildren) {
              // Already processed correctly, skip
              processedLinks.add(linkId);
              processedLinks.add(linkIdReverse);
              return;
            } else {
              // Overlay exists but is empty - remove marking and reprocess
              linkElement
                .classed('replaced-by-married-lines', false)
                .attr('data-replaced-by-married-lines', null)
                .style('opacity', null)
                .style('display', null)
                .style('visibility', null)
                .style('stroke', null)
                .style('pointer-events', null);
              d3.select(existingOverlay).remove();
            }
          } else {
            // Marked as replaced but no overlay - restore the link
            linkElement
              .classed('replaced-by-married-lines', false)
              .attr('data-replaced-by-married-lines', null)
              .style('opacity', null)
              .style('display', null)
              .style('visibility', null)
              .style('stroke', null)
              .style('pointer-events', null);
          }
        }
        
        // Check if this is a married link - process it faster
        // Calculate relationship status FIRST so we can use it for visibility check
        const relationshipStatus = getRelationshipStatus(d.source, d.target, allData);
        const isMarriedLink = relationshipStatus === 'married' || relationshipStatus === 'partnered';
        
        // Check visibility - use computed style for more accurate detection
        // For married links, be more lenient since they might be transitioning
        const linkNode = linkElement.node();
        let opacity = 1; // Default to visible
        if (linkNode) {
          try {
            const inlineOpacity = linkElement.style('opacity');
            const computedStyle = window.getComputedStyle(linkNode);
            const computedOpacity = computedStyle.opacity;
            // Prefer computed style (more accurate during transitions)
            opacity = parseFloat(computedOpacity || inlineOpacity || '1');
            // If opacity is NaN or invalid, default to 1 (visible)
            if (isNaN(opacity) || opacity < 0) opacity = 1;
          } catch (e) {
            // If we can't get computed style, assume visible
            opacity = 1;
          }
        }
        const pathData = linkElement.attr('d');
        const hasPath = pathData && pathData !== 'M0,0' && pathData.length > 10;
        
        const nodesComplete = isNodeTransitionComplete(d);
        
        // For married links, if they have a path and nodes are complete, process them regardless of opacity
        // (D3 transitions might set opacity to 0 initially, but the link is still there)
        // For other links, require opacity >= 0.99
        let isVisible;
        if (isMarriedLink) {
          // For married links, if path exists and nodes are complete, consider it visible
          // Opacity might be 0 during transitions, but the link element exists
          isVisible = hasPath && nodesComplete;
        } else {
          isVisible = opacity >= 0.99;
        }
        
        const previousPath = linkPathHistory.get(linkId);
        const pathStable = !previousPath || previousPath === pathData;
        
        if (pathStable && previousPath) {
          const currentCount = linkStabilityCount.get(linkId) || 0;
          linkStabilityCount.set(linkId, currentCount + 1);
        } else {
          linkStabilityCount.set(linkId, 0);
        }
        
        linkPathHistory.set(linkId, pathData);
        
        // Debug: Log Elena-Alfred link processing
        if ((sourceId === 'elena' && targetId === 'alfred-sr') || (sourceId === 'alfred-sr' && targetId === 'elena')) {
          const sourceX = d.source.x;
          const sourceY = d.source.y;
          const targetX = d.target.x;
          const targetY = d.target.y;
          const linkNode = linkElement.node();
          let debugOpacity = 'unknown';
          if (linkNode) {
            try {
              const inlineOpacity = linkElement.style('opacity');
              const computedStyle = window.getComputedStyle(linkNode);
              const computedOpacity = computedStyle.opacity;
              debugOpacity = `inline:${inlineOpacity || 'none'}, computed:${computedOpacity}`;
            } catch (e) {
              debugOpacity = `error:${e.message}`;
            }
          }
          console.log('[hookIntoLinkTransitions] Elena-Alfred link check:', {
            linkId,
            relationshipStatus,
            isMarriedLink,
            isVisible,
            opacity: debugOpacity,
            hasPath,
            nodesComplete,
            sourcePos: { x: sourceX, y: sourceY },
            targetPos: { x: targetX, y: targetY },
            elapsedTime: Date.now() - processInfo.startTime,
            stabilityCount: linkStabilityCount.get(linkId) || 0
          });
        }
        
        const stabilityCount = linkStabilityCount.get(linkId) || 0;
        const elapsedTime = Date.now() - processInfo.startTime;
        const isStableEnough = stabilityCount >= 1;
        
        // For married links, use more lenient checks and process earlier
        // For other links, wait a bit longer for stability
        const useLenientCheck = isMarriedLink ? elapsedTime > 50 : elapsedTime > 200;
        const needsStability = isMarriedLink ? true : isStableEnough; // Married links don't need stability check
        
        // For married links, also check if nodes have valid positions
        let hasValidPositions = true;
        if (isMarriedLink) {
          const sourceX = d.source.x;
          const sourceY = d.source.y;
          const targetX = d.target.x;
          const targetY = d.target.y;
          hasValidPositions = sourceX !== undefined && sourceY !== undefined && 
                             targetX !== undefined && targetY !== undefined &&
                             !isNaN(sourceX) && !isNaN(sourceY) && 
                             !isNaN(targetX) && !isNaN(targetY);
        }
        
        const shouldProceed = isVisible && hasPath && (needsStability || useLenientCheck) && nodesComplete && hasValidPositions;
        
        // Debug: Log why Elena-Alfred link is not proceeding
        if ((sourceId === 'elena' && targetId === 'alfred-sr') || (sourceId === 'alfred-sr' && targetId === 'elena')) {
          if (!shouldProceed) {
            console.log('[hookIntoLinkTransitions] Elena-Alfred link NOT proceeding:', {
              isVisible,
              hasPath,
              needsStability,
              useLenientCheck,
              nodesComplete,
              hasValidPositions,
              elapsedTime,
              stabilityCount
            });
          } else {
            console.log('[hookIntoLinkTransitions] Elena-Alfred link WILL proceed');
          }
        }
        
        if (shouldProceed) {
          if (linkElement.node() && linkElement.node().parentNode) {
            addDecorationForLink(linkElement, d);
            processedLinks.add(linkId);
            processedLinks.add(linkIdReverse);
          }
        } else {
          allComplete = false;
        }
      });
      
      // Stop polling if all links are processed or if we've been running too long
      const maxPollingTime = 2000; // Stop after 2 seconds max
      const currentElapsedTime = Date.now() - processInfo.startTime;
      const hasTimedOut = currentElapsedTime > maxPollingTime;
      
      if (allComplete || processedLinks.size >= currentLinkCount || hasTimedOut) {
        clearInterval(processInfo.interval);
        f3Chart._activeDecorationProcess = null;
        
        // Final pass: process any remaining links that weren't processed
        // Force process all links regardless of transition state
        if (f3Chart._activeDecorationProcess === null || f3Chart._activeDecorationProcess === processInfo) {
          currentLinks.each(function(d) {
            if (!d || !d.source || !d.target) return;
            const sourceId = d.source?.data?.id || d.source?.id;
            const targetId = d.target?.data?.id || d.target?.id;
            if (!sourceId || !targetId) return;
            
            const linkId = d.id || `${sourceId}-${targetId}`;
            const linkIdReverse = `${targetId}-${sourceId}`;
            
            // Check both linkId formats (source-target and target-source)
            const alreadyProcessed = processedLinks.has(linkId) || processedLinks.has(linkIdReverse);
            
            if (!alreadyProcessed && d3.select(this).node() && d3.select(this).node().parentNode) {
              // Force process - don't check transition state in final pass
              addDecorationForLink(d3.select(this), d);
              processedLinks.add(linkId);
              processedLinks.add(linkIdReverse);
            }
          });
        }
      }
    }, 50);
    
    // Safety: stop polling after max transition time + buffer (reduced from 3000ms to 2000ms)
    processInfo.timeout = setTimeout(() => {
      if (f3Chart._activeDecorationProcess === processInfo) {
        clearInterval(processInfo.interval);
        f3Chart._activeDecorationProcess = null;
        
        // Final pass: process ALL remaining links, including those that might have been missed
        const finalLinks = d3.select(svg).selectAll('path.link');
        finalLinks.each(function(d) {
          if (!d || !d.source || !d.target) return;
          const sourceId = d.source?.data?.id || d.source?.id;
          const targetId = d.target?.data?.id || d.target?.id;
          if (!sourceId || !targetId) return;
          
          const linkId = d.id || `${sourceId}-${targetId}`;
          const linkIdReverse = `${targetId}-${sourceId}`;
          
          // Check both linkId formats (source-target and target-source)
          const alreadyProcessed = processedLinks.has(linkId) || processedLinks.has(linkIdReverse);
          
          if (!alreadyProcessed && d3.select(this).node() && d3.select(this).node().parentNode) {
            // Force process in final pass - don't check transition state
            addDecorationForLink(d3.select(this), d);
            processedLinks.add(linkId);
            processedLinks.add(linkIdReverse);
          }
        });
      }
    }, 2000);
  }
}

