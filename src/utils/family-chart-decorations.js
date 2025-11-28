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
  
  // Override updateTree to include cleanup and decoration setup
  const originalUpdateTree = f3Chart.updateTree.bind(f3Chart);
  f3Chart.updateTree = function(props) {
    // Clean up old decorations IMMEDIATELY and SYNCHRONOUSLY when tree updates
    cleanupDecorations();
    
    const result = originalUpdateTree(props);
    
    // Hook into individual link transitions so decorations appear as each edge finishes
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
  }
  
  if (!relationshipStatus) return;
  
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
  
  // Remove existing decoration for this link if it exists
  linksView.select(`g#${linkId}`).remove();
  d3.select(svg).select(`g#${linkId}`).remove();
  
  let overlayGroup = linksView.select(`g#${linkId}`);
  if (overlayGroup.empty()) {
    overlayGroup = linksView
      .append('g')
      .attr('id', linkId)
      .attr('class', 'link-overlays');
  }
  
  // CRITICAL: Apply transform to position the decoration group at the decoration center
  overlayGroup.attr('transform', `translate(${decorationCenter.x}, ${decorationCenter.y})`);
  
  const baseWidth = 6;
  const markAngleDeg = 35;
  const markLengthPx = 24;
  const markSepPx = 16;
  const slashStrokeWidth = Math.max(2, baseWidth - 2);
  
  // Apply status-based styling to the link itself (for both regular and chained links)
  if (relationshipStatus === 'divorced') {
    linkElement.classed('edge--divorced', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'separated') {
    linkElement.classed('edge--separated', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'widowed') {
    linkElement.classed('edge--widowed', true).attr('stroke', '#AEB8C7');
  } else if (relationshipStatus === 'married' || relationshipStatus === 'partnered') {
    linkElement.classed('edge--married', true).attr('stroke', '#090909');
    // For married links, double parallel lines are handled separately
    // Don't draw decorations for married - the double lines are the decoration
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
  
  // For spouse links, sx is helpful but not required
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
   * Create chained links between past partners
   */
  function createChainedLinks() {
    const svg = f3Chart.svg;
  if (!svg) return;

  const linksView = d3.select(svg).select('.links_view');
  if (linksView.empty()) return;

  const allLinks = d3.select(svg).selectAll('path.link');
  const allPartnersByPerson = new Map();

  allLinks.each(function(d) {
    if (!d || !d.spouse || !d.source || !d.target) return;
    
    const source = d.source;
    const target = d.target;
    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;
    
    if (!sourceId || !targetId) return;

    const relationshipStatus = getRelationshipStatus(source, target, allData);
    if (!relationshipStatus) return;
    
    const sourcePerson = allData.find(p => p.id === sourceId);
    const targetPerson = allData.find(p => p.id === targetId);
    
    const sourceHasStatus = sourcePerson?.data?.relationshipStatuses?.[targetId];
    const targetHasStatus = targetPerson?.data?.relationshipStatuses?.[sourceId];
    
    let mainPersonId, partnerId, partnerNode;
    
    if (sourceHasStatus) {
      mainPersonId = sourceId;
      partnerId = targetId;
      partnerNode = target;
    } else if (targetHasStatus) {
      mainPersonId = targetId;
      partnerId = sourceId;
      partnerNode = source;
    } else {
      return;
    }
    
    if (!allPartnersByPerson.has(mainPersonId)) {
      allPartnersByPerson.set(mainPersonId, []);
    }
    
    const isCurrent = ['married', 'partnered'].includes(relationshipStatus);
    const isPast = ['divorced', 'separated', 'widowed'].includes(relationshipStatus);
    
    const mainPerson = allData.find(p => p.id === mainPersonId);
    const spouseOrder = mainPerson?.rels?.spouses || [];
    const partnerIndex = spouseOrder.indexOf(partnerId);
    
    allPartnersByPerson.get(mainPersonId).push({
      id: partnerId,
      node: partnerNode,
      status: relationshipStatus,
      isCurrent: isCurrent,
      isPast: isPast,
      spouseOrder: partnerIndex >= 0 ? partnerIndex : 999
    });
  });

  // Create chained links between consecutive past partners
  allPartnersByPerson.forEach((allPartners, mainPersonId) => {
    const pastPartners = allPartners.filter(p => p.isPast);
    
    if (pastPartners.length < 2) return;
    
    // Sort past partners from most recent to oldest
    pastPartners.sort((a, b) => {
      if (a.spouseOrder !== b.spouseOrder && a.spouseOrder !== 999 && b.spouseOrder !== 999) {
        return a.spouseOrder - b.spouseOrder;
      }
      if (a.spouseOrder !== 999 && b.spouseOrder === 999) return -1;
      if (a.spouseOrder === 999 && b.spouseOrder !== 999) return 1;
      return (a.node.x || 0) - (b.node.x || 0);
    });
    
    // Create links between consecutive partners
    for (let i = 0; i < pastPartners.length - 1; i++) {
      const partner1 = pastPartners[i];
      const partner2 = pastPartners[i + 1];
      const chainStatus = partner1.status || 'separated';
      
      // Check if link already exists
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
            
            const offset = 4.5;
            const offsetPoints = [];
            
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
              
              offsetPoints.push({
                x: points[i].x + nx * offset,
                y: points[i].y + ny * offset
              });
            }
            
            const overlayGroup = linksView.append('g')
              .attr('class', 'link-overlay-group')
              .attr('data-link-id', linkId)
              .attr('data-chain-link', 'true');
            
            const line = d3.line().x(d => d.x).y(d => d.y);
            const parallelPathString = line(offsetPoints);
            
            if (parallelPathString) {
              overlayGroup.append('path')
                .attr('d', parallelPathString)
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
    
    // Poll for link AND node completion - check every 50ms
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
        
        if (processedLinks.has(linkId)) return;
        
        const linkElement = d3.select(this);
        
        if (!linkElement.node() || !linkElement.node().parentNode) {
          return;
        }
        
        const opacity = parseFloat(linkElement.style('opacity') || '0');
        const isVisible = opacity >= 0.99;
        
        const pathData = linkElement.attr('d');
        const hasPath = pathData && pathData !== 'M0,0' && pathData.length > 10;
        
        const previousPath = linkPathHistory.get(linkId);
        const pathStable = !previousPath || previousPath === pathData;
        
        if (pathStable && previousPath) {
          const currentCount = linkStabilityCount.get(linkId) || 0;
          linkStabilityCount.set(linkId, currentCount + 1);
        } else {
          linkStabilityCount.set(linkId, 0);
        }
        
        linkPathHistory.set(linkId, pathData);
        
        const nodesComplete = isNodeTransitionComplete(d);
        
        const stabilityCount = linkStabilityCount.get(linkId) || 0;
        const elapsedTime = Date.now() - processInfo.startTime;
        const isStableEnough = stabilityCount >= 1;
        const useLenientCheck = elapsedTime > 500;
        const shouldProceed = isVisible && hasPath && (isStableEnough || useLenientCheck) && nodesComplete;
        
        if (shouldProceed) {
          if (linkElement.node() && linkElement.node().parentNode) {
            addDecorationForLink(linkElement, d);
            processedLinks.add(linkId);
          }
        } else {
          allComplete = false;
        }
      });
      
      if (allComplete || processedLinks.size >= currentLinkCount) {
        clearInterval(processInfo.interval);
        f3Chart._activeDecorationProcess = null;
        
        if (f3Chart._activeDecorationProcess === null || f3Chart._activeDecorationProcess === processInfo) {
          currentLinks.each(function(d) {
            if (!d || !d.source || !d.target) return;
            const linkId = d.id || `${d.source?.data?.id || d.source?.id}-${d.target?.data?.id || d.target?.id}`;
            if (!processedLinks.has(linkId) && d3.select(this).node() && d3.select(this).node().parentNode) {
              addDecorationForLink(d3.select(this), d);
            }
          });
        }
      }
    }, 50);
    
    // Safety: stop polling after max transition time + buffer
    processInfo.timeout = setTimeout(() => {
      if (f3Chart._activeDecorationProcess === processInfo) {
        clearInterval(processInfo.interval);
        f3Chart._activeDecorationProcess = null;
        
        const finalLinks = d3.select(svg).selectAll('path.link');
        finalLinks.each(function(d) {
          if (!d || !d.source || !d.target) return;
          const linkId = d.id || `${d.source?.data?.id || d.source?.id}-${d.target?.data?.id || d.target?.id}`;
          if (!processedLinks.has(linkId) && d3.select(this).node() && d3.select(this).node().parentNode) {
            addDecorationForLink(d3.select(this), d);
          }
        });
      }
    }, 3000);
  }
}

