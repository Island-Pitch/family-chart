/**
 * Collect test results from all scenarios
 * Run this function to test the current scenario and return results
 */

async function testCurrentScenario() {
  const match = window.location.pathname.match(/sc(\d+)\.html/);
  if (!match) {
    return { error: 'Not on a scenario page' };
  }
  
  const scenarioNum = parseInt(match[1], 10);
  const scenarioId = `sc${String(scenarioNum).padStart(2, '0')}`;
  
  const results = {
    scenario: scenarioId,
    timestamp: new Date().toISOString(),
    people: {
      expected: [],
      found: [],
      missing: [],
      duplicates: [],
      extra: []
    },
    overlaps: {
      nodes: [],
      links: []
    },
    rendering: {
      cardsRendered: 0,
      linksRendered: 0,
      hasMainPerson: false,
      mainPersonName: null
    },
    issues: [],
    status: 'unknown',
    supported: true
  };

  try {
    // Get expected people from JSON data
    const sourceDataEl = document.querySelector('#sourceData');
    if (sourceDataEl) {
      const jsonText = sourceDataEl.textContent.trim();
      try {
        const jsonData = JSON.parse(jsonText);
        const treeData = Array.isArray(jsonData) ? jsonData : (jsonData.treeData || []);
        
        results.people.expected = treeData.map(p => {
          const personData = p.data?.data || p.data || {};
          const fullName = personData.full_name || 
                          (personData.first_name && personData.last_name 
                            ? `${personData.first_name} ${personData.last_name}`.trim()
                            : personData.first_name || personData.preferred_name || p.id);
          return {
            id: p.id,
            name: fullName || p.id,
            isMain: p.main || false
          };
        });
      } catch (e) {
        results.issues.push(`Failed to parse JSON: ${e.message}`);
        results.supported = false;
      }
    } else {
      results.issues.push('Source data element not found');
      results.supported = false;
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

    results.rendering.cardsRendered = cards.length;

    // Check for main person
    const mainCard = document.querySelector('.f3 .card-main');
    if (mainCard) {
      results.rendering.hasMainPerson = true;
      const mainLabel = mainCard.querySelector('.card-label');
      if (mainLabel) {
        results.rendering.mainPersonName = mainLabel.textContent.trim();
      }
    }

    // Check for duplicates
    foundNames.forEach((count, name) => {
      if (count > 1) {
        results.people.duplicates.push({ name, count });
      }
    });

    // Check for missing people
    const foundNamesSet = new Set(results.people.found);
    results.people.expected.forEach(expected => {
      if (!foundNamesSet.has(expected.name)) {
        results.people.missing.push(expected);
      }
    });

    // Check for extra people (found but not in expected)
    const expectedNamesSet = new Set(results.people.expected.map(p => p.name));
    results.people.found.forEach(foundName => {
      if (!expectedNamesSet.has(foundName) && foundName !== 'Unknown') {
        results.people.extra.push(foundName);
      }
    });

    // Check for overlapping nodes
    const cardPositions = new Map();
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const key = `${Math.round(rect.left / 10) * 10},${Math.round(rect.top / 10) * 10}`;
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

    // Check for links
    const links = Array.from(document.querySelectorAll('.f3 .link'));
    results.rendering.linksRendered = links.length;

    // Determine overall status
    const hasCriticalIssues = results.overlaps.nodes.length > 0;
    const hasWarnings = results.people.missing.length > 0 || 
                       results.people.extra.length > 0 ||
                       !results.rendering.hasMainPerson;

    if (hasCriticalIssues) {
      results.status = 'FAILED';
      results.supported = false;
    } else if (hasWarnings) {
      results.status = 'WARNING';
    } else {
      results.status = 'PASSED';
    }

    if (results.overlaps.nodes.length > 0) {
      results.issues.push(`${results.overlaps.nodes.length} overlapping nodes detected`);
    }
    if (results.people.missing.length > 0) {
      results.issues.push(`${results.people.missing.length} expected people not found in tree`);
    }
    if (results.people.duplicates.length > 0) {
      results.issues.push(`${results.people.duplicates.length} duplicate names (may be expected if different people)`);
    }

    results.summary = {
      totalExpected: results.people.expected.length,
      totalFound: results.people.found.length,
      missingCount: results.people.missing.length,
      duplicateCount: results.people.duplicates.length,
      extraCount: results.people.extra.length,
      nodeOverlapCount: results.overlaps.nodes.length,
      linkOverlapCount: results.overlaps.links.length,
      cardsRendered: results.rendering.cardsRendered,
      linksRendered: results.rendering.linksRendered,
      hasMainPerson: results.rendering.hasMainPerson
    };

  } catch (error) {
    results.status = 'ERROR';
    results.supported = false;
    results.error = error.message;
    results.issues.push(`Error: ${error.message}`);
  }

  return results;
}

// Export
if (typeof window !== 'undefined') {
  window.testCurrentScenario = testCurrentScenario;
}

// Auto-run
if (window.location.pathname.includes('sc') && window.location.pathname.includes('.html')) {
  testCurrentScenario().then(results => {
    console.log('=== TEST RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    // Copy to clipboard if possible
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      console.log('Results copied to clipboard!');
    }
  });
}

