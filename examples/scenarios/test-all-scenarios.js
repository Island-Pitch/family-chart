/**
 * Test all scenarios for overlaps and missing people
 * Run this in the browser console on each scenario page
 */

async function testScenario(scenarioNumber) {
  const results = {
    scenario: `sc${String(scenarioNumber).padStart(2, '0')}`,
    timestamp: new Date().toISOString(),
    people: {
      expected: [],
      found: [],
      missing: [],
      duplicates: []
    },
    overlaps: {
      nodes: [],
      links: []
    },
    status: 'unknown'
  };

  try {
    // Get expected people from JSON data
    const sourceDataEl = document.querySelector('#sourceData');
    if (sourceDataEl) {
      const jsonText = sourceDataEl.textContent.trim();
      try {
        const jsonData = JSON.parse(jsonText);
        const treeData = Array.isArray(jsonData) ? jsonData : (jsonData.treeData || []);
        results.people.expected = treeData.map(p => ({
          id: p.id,
          name: p.data?.data?.full_name || p.data?.full_name || p.data?.data?.first_name || p.data?.first_name || p.id
        }));
      } catch (e) {
        console.error('Failed to parse JSON:', e);
      }
    }

    // Get found people from the tree
    const cards = Array.from(document.querySelectorAll('.f3 .card'));
    const foundNames = new Map();
    
    cards.forEach(card => {
      const labelEl = card.querySelector('.card-label');
      if (labelEl) {
        const name = labelEl.textContent.trim();
        const count = foundNames.get(name) || 0;
        foundNames.set(name, count + 1);
        
        results.people.found.push(name);
      }
    });

    // Check for duplicates
    foundNames.forEach((count, name) => {
      if (count > 1) {
        results.people.duplicates.push({ name, count });
      }
    });

    // Check for missing people
    const foundNamesSet = new Set(results.people.found);
    results.people.expected.forEach(expected => {
      const found = foundNamesSet.has(expected.name);
      if (!found) {
        results.people.missing.push(expected);
      }
    });

    // Check for overlapping nodes (cards with same position)
    const cardPositions = new Map();
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const key = `${Math.round(rect.left)},${Math.round(rect.top)}`;
      if (cardPositions.has(key)) {
        const existing = cardPositions.get(key);
        results.overlaps.nodes.push({
          name1: existing.name,
          name2: card.querySelector('.card-label')?.textContent.trim() || 'unknown',
          position: key
        });
      } else {
        const name = card.querySelector('.card-label')?.textContent.trim() || 'unknown';
        cardPositions.set(key, { name, card });
      }
    });

    // Check for overlapping links (lines that cross or overlap)
    const links = Array.from(document.querySelectorAll('.f3 .link'));
    const linkPositions = [];
    links.forEach(link => {
      const path = link.querySelector('path');
      if (path) {
        const d = path.getAttribute('d');
        const rect = link.getBoundingClientRect();
        linkPositions.push({
          d,
          rect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          }
        });
      }
    });

    // Simple overlap check: links with overlapping bounding boxes
    for (let i = 0; i < linkPositions.length; i++) {
      for (let j = i + 1; j < linkPositions.length; j++) {
        const link1 = linkPositions[i];
        const link2 = linkPositions[j];
        
        // Check if bounding boxes overlap significantly
        const overlapX = Math.max(0, Math.min(link1.rect.x + link1.rect.width, link2.rect.x + link2.rect.width) - Math.max(link1.rect.x, link2.rect.x));
        const overlapY = Math.max(0, Math.min(link1.rect.y + link1.rect.height, link2.rect.y + link2.rect.height) - Math.max(link1.rect.y, link2.rect.y));
        const overlapArea = overlapX * overlapY;
        const minArea = Math.min(link1.rect.width * link1.rect.height, link2.rect.width * link2.rect.height);
        
        // If overlap is more than 50% of the smaller link, consider it an overlap
        if (overlapArea > minArea * 0.5 && overlapArea > 100) {
          results.overlaps.links.push({
            link1: i,
            link2: j,
            overlapArea: Math.round(overlapArea)
          });
        }
      }
    }

    // Determine overall status
    const hasIssues = results.people.missing.length > 0 || 
                     results.people.duplicates.length > 0 ||
                     results.overlaps.nodes.length > 0 ||
                     results.overlaps.links.length > 0;

    results.status = hasIssues ? 'FAILED' : 'PASSED';
    results.summary = {
      totalExpected: results.people.expected.length,
      totalFound: results.people.found.length,
      missingCount: results.people.missing.length,
      duplicateCount: results.people.duplicates.length,
      nodeOverlapCount: results.overlaps.nodes.length,
      linkOverlapCount: results.overlaps.links.length
    };

  } catch (error) {
    results.status = 'ERROR';
    results.error = error.message;
    console.error('Error testing scenario:', error);
  }

  return results;
}

// Export for use
if (typeof window !== 'undefined') {
  window.testScenario = testScenario;
}

// Auto-run if on a scenario page
if (window.location.pathname.includes('sc') && window.location.pathname.includes('.html')) {
  const match = window.location.pathname.match(/sc(\d+)\.html/);
  if (match) {
    const scenarioNum = parseInt(match[1], 10);
    testScenario(scenarioNum).then(results => {
      console.log(`\n=== ${results.scenario.toUpperCase()} TEST RESULTS ===`);
      console.log('Status:', results.status);
      console.log('Summary:', results.summary);
      if (results.people.missing.length > 0) {
        console.warn('Missing people:', results.people.missing);
      }
      if (results.people.duplicates.length > 0) {
        console.warn('Duplicate people:', results.people.duplicates);
      }
      if (results.overlaps.nodes.length > 0) {
        console.warn('Overlapping nodes:', results.overlaps.nodes);
      }
      if (results.overlaps.links.length > 0) {
        console.warn('Overlapping links:', results.overlaps.links);
      }
      console.log('Full results:', results);
    });
  }
}
