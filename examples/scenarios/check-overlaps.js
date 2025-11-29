// Script to check all scenarios for overlapping nodes/links
// Run this in browser console on each scenario page

function checkOverlaps() {
  const cards = document.querySelectorAll('.f3 .card');
  const svg = document.querySelector('.f3 svg');
  const links = svg ? svg.querySelectorAll('line, path') : [];
  
  // Get positions of all cards
  const cardPositions = Array.from(cards).map(card => {
    const rect = card.getBoundingClientRect();
    return {
      id: card.getAttribute('data-person-id') || card.textContent.trim().substring(0, 30),
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom
    };
  });
  
  // Check for overlapping cards
  const overlaps = [];
  for (let i = 0; i < cardPositions.length; i++) {
    for (let j = i + 1; j < cardPositions.length; j++) {
      const card1 = cardPositions[i];
      const card2 = cardPositions[j];
      
      // Check if rectangles overlap (with small tolerance for rounding)
      const horizontalOverlap = !(card1.right < card2.x - 1 || card2.right < card1.x - 1);
      const verticalOverlap = !(card1.bottom < card2.y - 1 || card2.bottom < card1.y - 1);
      
      if (horizontalOverlap && verticalOverlap) {
        const overlapX = Math.min(card1.right, card2.right) - Math.max(card1.x, card2.x);
        const overlapY = Math.min(card1.bottom, card2.bottom) - Math.max(card1.y, card2.y);
        overlaps.push({
          card1: card1.id.trim(),
          card2: card2.id.trim(),
          overlapX: Math.round(overlapX),
          overlapY: Math.round(overlapY),
          overlapArea: Math.round(overlapX * overlapY)
        });
      }
    }
  }
  
  // Check for overlapping links (simplified - check if paths are too close)
  const linkOverlaps = [];
  const linkPositions = Array.from(links).map(link => {
    const x1 = parseFloat(link.getAttribute('x1') || '0');
    const y1 = parseFloat(link.getAttribute('y1') || '0');
    const x2 = parseFloat(link.getAttribute('x2') || '0');
    const y2 = parseFloat(link.getAttribute('y2') || '0');
    const d = link.getAttribute('d');
    return { x1, y1, x2, y2, d, element: link };
  });
  
  // Simple check: if two links share exact same endpoints, they overlap
  for (let i = 0; i < linkPositions.length; i++) {
    for (let j = i + 1; j < linkPositions.length; j++) {
      const link1 = linkPositions[i];
      const link2 = linkPositions[j];
      
      // Check if links share same start/end points (within 5px tolerance)
      const sameStart = Math.abs(link1.x1 - link2.x1) < 5 && Math.abs(link1.y1 - link2.y1) < 5;
      const sameEnd = Math.abs(link1.x2 - link2.x2) < 5 && Math.abs(link1.y2 - link2.y2) < 5;
      
      if (sameStart && sameEnd) {
        linkOverlaps.push({
          link1: `${link1.x1},${link1.y1} -> ${link1.x2},${link1.y2}`,
          link2: `${link2.x1},${link2.y1} -> ${link2.x2},${link2.y2}`
        });
      }
    }
  }
  
  return {
    totalCards: cards.length,
    totalLinks: links.length,
    cardOverlaps: overlaps,
    linkOverlaps: linkOverlaps,
    hasCardOverlaps: overlaps.length > 0,
    hasLinkOverlaps: linkOverlaps.length > 0,
    hasAnyOverlaps: overlaps.length > 0 || linkOverlaps.length > 0,
    cardPositions: cardPositions.map(c => ({
      id: c.id.trim().substring(0, 30),
      x: Math.round(c.x),
      y: Math.round(c.y),
      width: Math.round(c.width),
      height: Math.round(c.height)
    }))
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = checkOverlaps;
} else {
  window.checkOverlaps = checkOverlaps;
}

