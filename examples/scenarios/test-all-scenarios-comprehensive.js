/**
 * Comprehensive test script for all scenarios sc01-sc25
 * Run this in the browser console on each scenario page
 * Or use the batch test function
 */

async function testScenarioComprehensive(scenarioNumber) {
  const scenarioId = `sc${String(scenarioNumber).padStart(2, '0')}`;
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

    // Wait for chart to render
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get found people from the tree
    const cards = Array.from(document.querySelectorAll('.f3 .card'));
    const foundNames = new Map();
    const foundIds = new Set();
    
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

    // Check for overlapping nodes (cards with same position)
    const cardPositions = new Map();
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      // Use a grid-based key to detect overlaps (10px tolerance)
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
    const hasCriticalIssues = results.overlaps.nodes.length > 0 || 
                             results.people.duplicates.length > 0;
    const hasWarnings = results.people.missing.length > 0 || 
                       results.people.extra.length > 0 ||
                       !results.rendering.hasMainPerson;

    if (hasCriticalIssues) {
      results.status = 'FAILED';
    } else if (hasWarnings) {
      results.status = 'WARNING';
    } else {
      results.status = 'PASSED';
    }

    // Determine if scenario is fully supported
    if (results.overlaps.nodes.length > 0) {
      results.supported = false;
      results.issues.push(`${results.overlaps.nodes.length} overlapping nodes detected`);
    }
    if (results.people.duplicates.length > 0 && results.people.duplicates.some(d => d.count > 2)) {
      // More than 2 of the same name might indicate a real issue
      results.issues.push(`${results.people.duplicates.length} duplicate names (may be expected)`);
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
    console.error(`Error testing ${scenarioId}:`, error);
  }

  return results;
}

// Batch test function - tests all scenarios
async function testAllScenarios() {
  const allResults = [];
  const baseUrl = window.location.origin + window.location.pathname.replace(/sc\d+\.html$/, '');
  
  console.log('Starting comprehensive test of all scenarios...');
  console.log(`Base URL: ${baseUrl}`);
  
  for (let i = 1; i <= 25; i++) {
    const scenarioId = `sc${String(i).padStart(2, '0')}`;
    const url = `${baseUrl}${scenarioId}.html`;
    
    console.log(`\nTesting ${scenarioId}...`);
    console.log(`URL: ${url}`);
    
    // Navigate to scenario
    window.location.href = url;
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test the scenario
    const result = await testScenarioComprehensive(i);
    allResults.push(result);
    
    console.log(`${scenarioId} result:`, result.status, result.summary);
  }
  
  return allResults;
}

// Export for use
if (typeof window !== 'undefined') {
  window.testScenarioComprehensive = testScenarioComprehensive;
  window.testAllScenarios = testAllScenarios;
}

// Auto-run if on a scenario page
if (window.location.pathname.includes('sc') && window.location.pathname.includes('.html')) {
  const match = window.location.pathname.match(/sc(\d+)\.html/);
  if (match) {
    const scenarioNum = parseInt(match[1], 10);
    testScenarioComprehensive(scenarioNum).then(results => {
      console.log(`\n=== ${results.scenario.toUpperCase()} COMPREHENSIVE TEST RESULTS ===`);
      console.log('Status:', results.status);
      console.log('Supported:', results.supported);
      console.log('Summary:', results.summary);
      if (results.issues.length > 0) {
        console.warn('Issues:', results.issues);
      }
      if (results.people.missing.length > 0) {
        console.warn('Missing people:', results.people.missing);
      }
      if (results.people.duplicates.length > 0) {
        console.warn('Duplicate names:', results.people.duplicates);
      }
      if (results.overlaps.nodes.length > 0) {
        console.error('Overlapping nodes:', results.overlaps.nodes);
      }
      console.log('Full results:', results);
    });
  }
}

