/**
 * Simple decoration system for family charts
 * Applies relationship status decorations (/, //, X) and married double lines
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
    
    d3.select(svg).selectAll('g.link-decoration').remove();
    d3.select(svg).selectAll('g.married-link-group').remove();
    d3.select(svg).selectAll('line.slash').remove();
  }
  
  f3Chart.cleanupDecorations = cleanupDecorations;
  
  // Override updateTree to apply decorations after links are rendered
  const originalUpdateTree = f3Chart.updateTree.bind(f3Chart);
  f3Chart.updateTree = function(props) {
    if (props && props.data) {
      f3Chart._allData = props.data;
    }
    
    cleanupDecorations();
    const result = originalUpdateTree(props);
    
    // Apply decorations after links are rendered and transitions complete
    // For initial load, wait for transition_time to complete
    // For updates, use shorter delay
    const transitionTime = f3Chart.transition_time || 1000;
    const delay = props?.initial ? transitionTime + 100 : 200;
    
    setTimeout(() => {
      applyDecorations();
    }, delay);
    
    return result;
  };
  
  /**
   * Apply decorations to all spouse links based on relationship status
   */
  function applyDecorations() {
    const svg = f3Chart.svg;
    if (!svg) return;
    
    const linksView = d3.select(svg).select('.links_view');
    if (linksView.empty()) return;
    
    const allLinks = d3.select(svg).selectAll('path.link');
    const dataToUse = getAllData();
    
    // Also check for existing married-link-groups to avoid re-processing
    const existingMarriedGroups = d3.select(svg).selectAll('g.married-link-group');
    const processedLinkIds = new Set();
    existingMarriedGroups.each(function() {
      const group = d3.select(this);
      const linkId = group.attr('data-link-id');
      if (linkId) processedLinkIds.add(linkId);
    });
    
    allLinks.each(function(d) {
      if (!d || !d.source || !d.target) return;
      
      const source = d.source;
      const target = d.target;
      const sourceId = source.data?.id || source.id;
      const targetId = target.data?.id || target.id;
      
      if (!sourceId || !targetId) return;
      
      const linkElement = d3.select(this);
      const linkId = d.id;
      
      // Skip if already replaced by married lines or already processed
      if (linkElement.classed('replaced-by-married-lines') || processedLinkIds.has(linkId)) return;
      
      const linkPath = linkElement.node();
      if (!linkPath || !linkPath.getTotalLength) return;
      
      // Handle parent-child links for adoption styling
      if (!d.spouse) {
        const childData = target.data || target;
        const childPersonData = childData.data || childData;
        const childId = childData.id || target.id || target.data?.id;
        const childInAllData = dataToUse.find(p => p.id === childId);
        const adoptedFromData = childInAllData?.data?.adopted === true;
        const isAdopted = childPersonData?.adopted === true || 
                         childData?.adopted === true ||
                         childPersonData?.data?.adopted === true ||
                         adoptedFromData;
        
        if (isAdopted) {
          linkElement.classed('edge--adopted', true)
            .attr('stroke', '#090909')
            .attr('stroke-width', '6')
            .attr('stroke-dasharray', '12 12')
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round');
        }
        return;
      }
      
      // Get relationship status from metadata for spouse links
      const relationshipStatus = getRelationshipStatus(source, target, dataToUse) ||
                                getPastPartnerRelationshipStatus(source, target, dataToUse);
      
      if (!relationshipStatus) return;
      
      // Get link path points
      const pathLength = linkPath.getTotalLength();
      if (pathLength === 0) return;
      
      const startPoint = linkPath.getPointAtLength(0);
      const endPoint = linkPath.getPointAtLength(pathLength);
      const midPoint = linkPath.getPointAtLength(pathLength / 2);
      
      // Use node Y for horizontal links
      const nodeSourceY = source.y;
      const nodeTargetY = target.y;
      const avgNodeY = (nodeSourceY !== undefined && nodeTargetY !== undefined && !isNaN(nodeSourceY) && !isNaN(nodeTargetY))
        ? (nodeSourceY + nodeTargetY) / 2
        : midPoint.y;
      const useNodeY = Math.abs(midPoint.y) < 1 && avgNodeY !== undefined && !isNaN(avgNodeY) && Math.abs(avgNodeY) > 1;
      const decorationY = useNodeY ? avgNodeY : midPoint.y;
      
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
      
      // Apply decoration based on status
      if (relationshipStatus === 'married' || relationshipStatus === 'partnered') {
        applyMarriedLines(linkElement, linkPath, startPoint, endPoint);
      } else if (relationshipStatus === 'divorced') {
        applyDecoration(linkElement, linkPath, midPoint.x, decorationY, 'divorced');
      } else if (relationshipStatus === 'separated') {
        applyDecoration(linkElement, linkPath, midPoint.x, decorationY, 'separated');
      } else if (relationshipStatus === 'widowed') {
        applyDecoration(linkElement, linkPath, midPoint.x, decorationY, 'widowed');
      }
    });
  }
  
  /**
   * Replace single link with double parallel lines for married relationships
   */
  function applyMarriedLines(linkElement, linkPath, startPoint, endPoint) {
    const svg = f3Chart.svg;
    const linksView = d3.select(svg).select('.links_view');
    
    const source = linkElement.datum().source;
    const target = linkElement.datum().target;
    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;
    const linkId = linkElement.datum().id;
    
    // Check if already replaced
    if (linkElement.classed('replaced-by-married-lines')) return;
    
    // Calculate perpendicular offset for parallel lines
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const separation = 9; // 9px between lines
    const halfSep = separation / 2;
    
    // Create two parallel lines
    const start1 = { x: startPoint.x - nx * halfSep, y: startPoint.y - ny * halfSep };
    const end1 = { x: endPoint.x - nx * halfSep, y: endPoint.y - ny * halfSep };
    const start2 = { x: startPoint.x + nx * halfSep, y: startPoint.y + ny * halfSep };
    const end2 = { x: endPoint.x + nx * halfSep, y: endPoint.y + ny * halfSep };
    
    // Get the link's parent and insert group before removing link
    const linkNode = linkElement.node();
    const parentNode = linkNode.parentNode;
    
    // Create group to replace the link (insert before the link node)
    const linkGroup = d3.select(parentNode).insert('g', () => linkNode)
      .attr('class', 'link married-link-group')
      .attr('data-link-id', linkId);
    
    const line = d3.line().x(d => d.x).y(d => d.y);
    
    // Create first parallel line
    linkGroup.append('path')
      .attr('d', line([start1, end1]))
      .attr('class', 'link married-line-1')
      .style('stroke', '#090909')
      .style('stroke-width', '6')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .style('fill', 'none');
    
    // Create second parallel line
    linkGroup.append('path')
      .attr('d', line([start2, end2]))
      .attr('class', 'link married-line-2')
      .style('stroke', '#090909')
      .style('stroke-width', '6')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .style('fill', 'none');
    
    // Remove original link and mark as replaced
    linkElement
      .classed('replaced-by-married-lines', true)
      .remove();
  }
  
  /**
   * Apply status decoration (/, //, X) to a link
   */
  function applyDecoration(linkElement, linkPath, x, y, status) {
    const svg = f3Chart.svg;
    const linksView = d3.select(svg).select('.links_view');
    
    const source = linkElement.datum().source;
    const target = linkElement.datum().target;
    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;
    const decorationId = `decoration-${sourceId}-${targetId}`;
    
    // Remove existing decoration
    linksView.select(`g#${decorationId}`).remove();
    
    // Calculate angle from link path
    const pathLength = linkPath.getTotalLength();
    const pointBefore = linkPath.getPointAtLength(Math.max(0, pathLength / 2 - 5));
    const pointAfter = linkPath.getPointAtLength(Math.min(pathLength, pathLength / 2 + 5));
    const dx = pointAfter.x - pointBefore.x;
    const dy = pointAfter.y - pointBefore.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Create decoration group
    const decorationGroup = linksView.append('g')
      .attr('id', decorationId)
      .attr('class', 'link-decoration')
      .attr('transform', `translate(${x}, ${y})`);
    
    const markAngleDeg = 35;
    const markLengthPx = 24;
    const markSepPx = 16;
    const slashStrokeWidth = 4;
    const color = '#AEB8C7';
    
    // Apply decoration based on status
    if (status === 'divorced') {
      // Double slash (//)
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, -markSepPx/2, markLengthPx, color, slashStrokeWidth);
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, markSepPx/2, markLengthPx, color, slashStrokeWidth);
    } else if (status === 'separated') {
      // Single slash (/)
      drawSlash(decorationGroup, {x: 0, y: 0}, angle, markAngleDeg, 0, markLengthPx, color, slashStrokeWidth);
    } else if (status === 'widowed') {
      // X symbol
      const size = 16;
      drawSlash(decorationGroup, {x: 0, y: 0}, angle + 45, 0, 0, size, color, 5);
      drawSlash(decorationGroup, {x: 0, y: 0}, angle - 45, 0, 0, size, color, 5);
    }
    
    // Style the link
    linkElement
      .classed(`edge--${status}`, true)
      .style('stroke', '#AEB8C7');
  }
}
