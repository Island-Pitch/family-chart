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
    d3.select(svg).selectAll('path.link.edge--married').classed('edge--married', false).classed('married-line-1', false);
    d3.select(svg).selectAll('path.link.edge--divorced').classed('edge--divorced', false);
    d3.select(svg).selectAll('path.link.edge--separated').classed('edge--separated', false);
    d3.select(svg).selectAll('path.link.edge--widowed').classed('edge--widowed', false);
    d3.select(svg).selectAll('path.link.edge--unknown').classed('edge--unknown', false);
    d3.select(svg).selectAll('path.link.edge--adopted').classed('edge--adopted', false);
    
    // Remove unused __marriedLine property from nodes
    d3.select(svg).selectAll('path.link').each(function() {
      if (this.__marriedLine) {
        delete this.__marriedLine;
      }
    });
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
    
    // Check if links view exists
    if (d3.select(svg).select('.links_view').empty()) return;
    
    const allLinks = d3.select(svg).selectAll('path.link');
    const dataToUse = getAllData();
    
    allLinks.each(function(d) {
      if (!d || !d.source || !d.target) return;
      
      const source = d.source;
      const target = d.target;
      const sourceId = source.data?.id || source.id;
      const targetId = target.data?.id || target.id;
      
      if (!sourceId || !targetId) return;
      
      const linkElement = d3.select(this);
      const linkPath = linkElement.node();
      
      if (!linkPath || !linkPath.getTotalLength) return;
      
      // Skip if already processed as married (has the class and second line exists)
      if (linkElement.classed('edge--married')) {
        // Check if second line still exists as a sibling, if not, reapply
        const parentNode = linkPath.parentNode;
        if (parentNode) {
          // Check for second line in the same parent (sibling check)
          const siblings = Array.from(parentNode.children);
          const hasSecondLine = siblings.some(sibling => {
            const siblingEl = d3.select(sibling);
            return siblingEl.classed('married-line-2') && siblingEl.classed('edge--married');
          });
          if (hasSecondLine) return; // Already fully processed
        }
      }
      
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
      // Check for chained relationship status first (for chain links between past partners)
      let relationshipStatus = d.chainedRelationshipStatus;
      
      if (!relationshipStatus) {
        // For direct spouse links, getRelationshipStatus already checks both directions
        relationshipStatus = getRelationshipStatus(source, target, dataToUse) ||
                            getPastPartnerRelationshipStatus(source, target, dataToUse);
      }
      
      if (!relationshipStatus) return;
      
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
      if (relationshipStatus === 'married' || relationshipStatus === 'partnered') {
        // Married: Replace single line with two parallel lines
        applyMarriedLines(linkElement, linkPath, linkData, startPoint, endPoint);
      } else if (relationshipStatus === 'divorced' || relationshipStatus === 'separated' || relationshipStatus === 'widowed') {
        // Other statuses: Add CSS class and create decoration (X, /, or //)
        linkElement.classed(`edge--${relationshipStatus}`, true);
        applyStatusDecoration(linkElement, linkPath, linkData, startPoint, endPoint, relationshipStatus);
      } else {
        // Unknown or other statuses: Just add CSS class
        linkElement.classed(`edge--${relationshipStatus}`, true);
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
        .classed('edge--married', true)
        .classed('married-line-1', true)
        .datum(modifiedLinkData1) // Update datum to prevent D3 from overwriting
        .attr('d', line([start1, end1])); // Offset original path to one side
      
      // Get the link's parent and insert second path as sibling on other side
      const linkNode = linkElement.node();
      const parentNode = linkNode.parentNode;
      const nextSibling = linkNode.nextSibling;
      
      // Create second path element - styled purely with CSS classes
      const secondPath = d3.select(parentNode).insert('path', nextSibling ? () => nextSibling : null)
        .datum(modifiedLinkData2) // Set datum to prevent D3 from overwriting
        .attr('d', line([start2, end2]))
        .attr('class', 'link edge--married married-line-2');
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
   * Creates SVG elements positioned at the midpoint of the link
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
    
    // Calculate midpoint for decoration placement
    const midPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2
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
