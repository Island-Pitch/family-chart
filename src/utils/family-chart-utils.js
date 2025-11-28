/**
 * Reusable utilities for family chart examples
 * Extracted from 12-figma-aligned-styling.html
 */

import * as d3 from "d3";

/**
 * Normalize gender values to M, F, or NB
 */
export function normalizeGender(gender) {
  if (!gender) return 'M'; // Default to M if not specified
  const g = String(gender).trim().toUpperCase();
  if (g === 'M' || g === 'MALE') return 'M';
  if (g === 'F' || g === 'FEMALE') return 'F';
  if (g === 'NB' || g === 'NON-BINARY' || g === 'NONBINARY' || g === 'X' || g === 'N') return 'NB';
  return 'M'; // Default fallback
}

/**
 * Generate initials from a full name
 */
export function generateInitials(name) {
  if (!name || name.trim() === '') return '??';
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter(p => p.length > 0);
  if (parts.length >= 2) {
    // First letter of first name + first letter of last name
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    // Single name with 2+ characters: use first 2 letters
    return (parts[0][0] + parts[0][1]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length === 1) {
    // Single character: duplicate it
    return (parts[0][0] + parts[0][0]).toUpperCase();
  }
  // Fallback
  return '??';
}

/**
 * Get border color based on gender
 */
export function getGenderBorderColor(gender) {
  // Gender-based border colors matching Figma
  if (gender === 'M' || gender === 'male' || gender === 'Male') {
    return '#03a9f4'; // Blue for male
  } else if (gender === 'F' || gender === 'female' || gender === 'Female') {
    return '#e91e63'; // Pink/red for female
  } else if (gender === 'NB' || gender === 'non-binary' || gender === 'Non-Binary' || gender === 'X' || gender === 'N') {
    return '#FFD700'; // Yellow for non-binary - matching Figma yellow (gold/yellow)
  } else {
    return '#d1d1d6'; // Grey for unknown/unspecified
  }
}

/**
 * Get CSS class based on gender
 */
export function getGenderClass(gender) {
  if (gender === 'M' || gender === 'male' || gender === 'Male') {
    return 'card-male';
  } else if (gender === 'F' || gender === 'female' || gender === 'Female') {
    return 'card-female';
  } else if (gender === 'NB' || gender === 'non-binary' || gender === 'Non-Binary') {
    return 'card-nonbin';
  } else {
    return 'card-genderless';
  }
}

/**
 * Transform scenario JSON format to family-chart format
 */
export function transformScenarioData(scenarioData) {
  const transformed = scenarioData.treeData.map(person => {
    const personData = person.data?.data || person.data || {};
    const rels = person.rels || person.data?.rels || {};
    
    // Generate initials from full_name
    const fullName = personData.full_name || personData.first_name || 'Unknown';
    const initials = generateInitials(fullName);
    
    // Build parents array from father/mother if needed
    const parents = [];
    if (rels.father) parents.push(rels.father);
    if (rels.mother) parents.push(rels.mother);
    // Also check rels.parents if it exists
    if (rels.parents && Array.isArray(rels.parents)) {
      rels.parents.forEach(p => {
        if (p && !parents.includes(p)) parents.push(p);
      });
    }
    
    // Preserve relationshipStatuses from original data structure
    let relationshipStatuses = person.data?.relationshipStatuses || 
                                 person.data?.data?.relationshipStatuses || 
                                 personData.relationshipStatuses || 
                                 {};
    
    // Determine gender - normalize from multiple possible sources
    let gender = normalizeGender(personData.gender || person.data?.gender || 'M');
    
    // Determine if deceased - auto-true if death_date exists
    let deceased = personData.deceased || false;
    const deathDate = personData.death_date || personData.deathDate || personData.died || personData.deceased_date;
    if (deathDate && !deceased) {
      deceased = true;
    }
    
    // Determine if adopted
    let adopted = personData.adopted || false;
    
    return {
      id: person.id,
      main: person.main || false,
      data: {
        gender: gender,
        "first name": personData.first_name || fullName.split(/\s+/)[0] || 'Unknown',
        "last name": personData.last_name || (fullName.split(/\s+/).length > 1 ? fullName.split(/\s+/).slice(1).join(' ') : ''),
        "full_name": fullName,
        deceased: deceased,
        death_date: deathDate || null,
        "label": fullName,
        "initials": initials,
        "relationshipStatuses": relationshipStatuses,
        "avatar": personData.avatar || personData.avatarUrl || personData.image || null,
        "adopted": adopted
      },
      rels: {
        spouses: rels.spouses || [],
        parents: parents,
        children: rels.children || [],
        siblings: rels.siblings || [] // Preserve original siblings array
      }
    };
  });
  
  // Validate data consistency
  transformed.forEach((p) => {
    // Normalize and validate gender
    const gender = normalizeGender(p.data.gender);
    p.data.gender = gender;
    
    // Ensure rels has the expected structure
    if (p.rels) {
      if (!Array.isArray(p.rels.parents)) p.rels.parents = [];
      if (!Array.isArray(p.rels.spouses)) p.rels.spouses = [];
      if (!Array.isArray(p.rels.children)) p.rels.children = [];
    }
  });
  
  // Add stepsiblings to siblings arrays AND make them share a virtual parent
  // Stepsiblings are children of step-parents (all spouses - current AND past - of one's parent)
  // To make the library detect them as siblings, we add the step-parent to the parents array
  transformed.forEach(person => {
    const rels = person.rels || {};
    const parents = rels.parents || [];
    const allParentIds = new Set(parents);
    
    // Find stepsiblings: children of step-parents (all spouses of parents, current and past)
    const stepsiblingIds = new Set();
    const stepParentIds = new Set();
    
    allParentIds.forEach(parentId => {
      const parent = transformed.find(p => p.id === parentId);
      if (parent) {
        const parentRels = parent.rels || {};
        // Get ALL spouses (current and past) - the spouses array should include all
        const parentSpouses = parentRels.spouses || [];
        
        // Also check for past partners in relationshipStatuses if available
        const parentData = parent.data || {};
        const relationshipStatuses = parentData.relationshipStatuses || {};
        const pastPartnerIds = Object.keys(relationshipStatuses).filter(personId => {
          const status = relationshipStatuses[personId];
          return status && (
            status.status === 'divorced' || 
            status.status === 'separated' || 
            status.status === 'widowed' ||
            (status.status && status.status !== 'married' && status.status !== 'engaged')
          );
        });
        
        // Combine current/past spouses from spouses array and past partners from relationshipStatuses
        const allPartners = new Set([...parentSpouses, ...pastPartnerIds]);
        
        // For each partner (current or past) of the parent, find their children
        allPartners.forEach(partnerId => {
          // Check if this partner is actually a step-parent (not a biological parent)
          const isStepParent = !allParentIds.has(partnerId);
          
          if (isStepParent) {
            stepParentIds.add(partnerId);
            const stepParent = transformed.find(p => p.id === partnerId);
            if (stepParent) {
              const stepParentRels = stepParent.rels || {};
              const stepParentChildren = stepParentRels.children || [];
              
              // Add step-parent's children as stepsiblings
              // These are the children of all past partners (and current partners) of the parent
              stepParentChildren.forEach(childId => {
                if (childId !== person.id) { // Don't include self
                  stepsiblingIds.add(childId);
                }
              });
            }
          }
        });
      }
    });
    
    // Add stepsiblings to siblings array if not already present
    // NOTE: We do NOT add step-parents to the parents array here
    // This would break the tree layout (children would drop from wrong parents)
    // Instead, we'll use modifyTreeHierarchy to add stepsiblings after the tree is built
    if (stepsiblingIds.size > 0) {
      if (!rels.siblings) rels.siblings = [];
      const siblingsSet = new Set(rels.siblings);
      stepsiblingIds.forEach(stepsibId => {
        if (!siblingsSet.has(stepsibId)) {
          rels.siblings.push(stepsibId);
        }
      });
    }
  });
  
  return transformed;
}

/**
 * Create a modifyTreeHierarchy function that adds stepsiblings to the tree
 */
export function createStepsiblingModifier(allData) {
  return function modifyTreeHierarchy(tree, is_ancestry) {
    if (is_ancestry) return; // Only modify progeny/main person side
    
    const main = tree.find(d => d.data && d.data.main);
    if (!main) return;
    
    const mainId = main.data.id;
    const mainPerson = allData.find(p => p.id === mainId);
    if (!mainPerson) return;
    
    const mainRels = mainPerson.rels || {};
    const mainParents = mainRels.parents || [];
    const mainSiblings = mainRels.siblings || [];
    
    // Find stepsiblings from the siblings array (which we added in transformScenarioData)
    // Stepsiblings are in the siblings array but don't share a parent
    const stepsiblings = mainSiblings.filter(sibId => {
      const sibling = allData.find(p => p.id === sibId);
      if (!sibling) return false;
      
      // Check if already in tree (regular siblings are already added by setupSiblings)
      const alreadyInTree = tree.find(d => d.data && d.data.id === sibId);
      if (alreadyInTree) return false; // Already added, skip
      
      const siblingRels = sibling.rels || {};
      const siblingParents = siblingRels.parents || [];
      
      // Check if this sibling shares any parents with main person
      const sharesParent = mainParents.some(pId => siblingParents.includes(pId));
      
      // If they don't share a parent, they're a stepsibling
      return !sharesParent;
    });
    
    if (stepsiblings.length === 0) return;
    
    // Get the main person's parents in the tree
    const mainParentsInTree = main.parents || [];
    if (mainParentsInTree.length === 0) return;
    
    // Get node_separation from the tree context (estimate if not available)
    const node_separation = 200; // Default spacing
    
    // Get existing siblings to calculate positioning
    const existingSiblings = tree.filter(d => d.sibling && d.data && d.data.id !== mainId);
    const main_x = main.x || 0;
    const spouses_x = (main.spouses || []).map(d => d.x).filter(x => x !== undefined);
    const siblings_x = existingSiblings.map(d => d.x).filter(x => x !== undefined);
    const x_range = [main_x, ...spouses_x, ...siblings_x];
    const max_x = x_range.length > 0 ? Math.max(...x_range) : main_x;
    
    // For each stepsibling, add them to the tree as siblings
    stepsiblings.forEach((stepsibId, index) => {
      const stepsibPerson = allData.find(p => p.id === stepsibId);
      if (!stepsibPerson) return;
      
      // Create a tree node for the stepsibling
      const stepsibNode = {
        data: stepsibPerson,
        sibling: true,
        x: max_x + node_separation * (index + 1), // Position to the right of existing siblings
        y: main.y,
        depth: main.depth - 1,
        parents: mainParentsInTree, // Use same parents as main for positioning
        children: []
      };
      
      tree.push(stepsibNode);
    });
  };
}

/**
 * Get relationship status from data
 */
export function getRelationshipStatus(source, target, allData) {
  try {
    if (!source || !target || !allData) return null;

    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;

    if (!sourceId || !targetId) return null;

    const sourcePerson = allData.find(p => p.id === sourceId);
    const targetPerson = allData.find(p => p.id === targetId);

    if (!sourcePerson || !targetPerson) return null;

    let sourceRelStatuses = sourcePerson.data?.relationshipStatuses || {};
    if (typeof sourceRelStatuses === 'string') {
      try {
        sourceRelStatuses = JSON.parse(sourceRelStatuses);
      } catch (e) {
        sourceRelStatuses = {};
      }
    }

    let targetRelStatuses = targetPerson.data?.relationshipStatuses || {};
    if (typeof targetRelStatuses === 'string') {
      try {
        targetRelStatuses = JSON.parse(targetRelStatuses);
      } catch (e) {
        targetRelStatuses = {};
      }
    }

    let relationshipStatus = null;
    if (sourceRelStatuses[targetId] && sourceRelStatuses[targetId].status) {
      relationshipStatus = sourceRelStatuses[targetId].status;
    }
    if (!relationshipStatus && targetRelStatuses[sourceId] && targetRelStatuses[sourceId].status) {
      relationshipStatus = targetRelStatuses[sourceId].status;
    }

    return relationshipStatus;
  } catch (error) {
    console.warn('Error in getRelationshipStatus:', error);
    return null;
  }
}

/**
 * Detect if two people are both past partners of the same person
 */
export function getPastPartnerRelationshipStatus(source, target, allData) {
  try {
    if (!source || !target || !allData) return null;

    const sourceId = source.data?.id || source.id;
    const targetId = target.data?.id || target.id;

    if (!sourceId || !targetId) return null;

    const sourcePerson = allData.find(p => p.id === sourceId);
    const targetPerson = allData.find(p => p.id === targetId);

    if (!sourcePerson || !targetPerson) return null;

    const sourceRelStatuses = sourcePerson.data?.relationshipStatuses || {};
    const sourcePastPartners = [];
    for (const [partnerId, relStatus] of Object.entries(sourceRelStatuses)) {
      if (relStatus && relStatus.status && ['divorced', 'separated', 'widowed'].includes(relStatus.status)) {
        sourcePastPartners.push(partnerId);
      }
    }

    const targetRelStatuses = targetPerson.data?.relationshipStatuses || {};
    const targetPastPartners = [];
    for (const [partnerId, relStatus] of Object.entries(targetRelStatuses)) {
      if (relStatus && relStatus.status && ['divorced', 'separated', 'widowed'].includes(relStatus.status)) {
        targetPastPartners.push(partnerId);
      }
    }

    const commonPastPartner = sourcePastPartners.find(partnerId => targetPastPartners.includes(partnerId));
    
    if (commonPastPartner) {
      return 'separated';
    }

    return null;
  } catch (error) {
    console.warn('Error in getPastPartnerRelationshipStatus:', error);
    return null;
  }
}

/**
 * Draw a slash decoration on a link
 */
export function drawSlash(group, center, baseAngle, slashAngle, offset, length, color, width = 3) {
  const baseRad = (baseAngle * Math.PI) / 180;
  const slashRad = (slashAngle * Math.PI) / 180;
  
  const ux = Math.cos(baseRad);
  const uy = Math.sin(baseRad);
  const nx = -uy;
  const ny = ux;
  
  const vx = Math.cos(slashRad) * ux + Math.sin(slashRad) * nx;
  const vy = Math.cos(slashRad) * uy + Math.sin(slashRad) * ny;
  
  const cx = ux * offset;
  const cy = uy * offset;
  
  const x1 = cx - vx * length;
  const y1 = cy - vy * length;
  const x2 = cx + vx * length;
  const y2 = cy + vy * length;
  
  group.append('line')
    .attr('class', 'link-overlay slash')
    .attr('x1', x1)
    .attr('y1', y1)
    .attr('x2', x2)
    .attr('y2', y2)
    .attr('stroke', color)
    .attr('stroke-width', width)
    .attr('stroke-linecap', 'round');
}

/**
 * Create Card renderer function for family chart
 */
export function createCardRenderer(f3Chart) {
  return function Card() {
    return function (d) {
      const card = this.querySelector('.card');
      if (!card) return;
      
      const personId = d.data?.id || d.id || d.data?.data?.id || 'unknown';
      const personData = d.data?.data || d.data || {};
      
      let gender = normalizeGender(personData.gender || d.data?.gender || 'M');
      let deceasedFromData = personData.deceased !== undefined ? personData.deceased : (d.data?.deceased !== undefined ? d.data.deceased : false);
      
      gender = normalizeGender(gender);
      
      const fullName = personData.full_name || personData.label ||
                      (personData['first name'] && personData['last name'] 
                        ? `${personData['first name']} ${personData['last name']}`.trim()
                        : personData['first name'] || personData['last name'] || 'Unknown');
      
      const initials = personData.initials || generateInitials(fullName);
      const borderColor = getGenderBorderColor(gender);
      const genderClass = getGenderClass(gender);
      const isMain = d.data?.main || d.main || false;
      
      const deceasedValue = d.data?.deceased !== undefined ? d.data.deceased : (personData.deceased !== undefined ? personData.deceased : deceasedFromData);
      const deathDate = d.data?.death_date || personData.death_date || personData.deathDate;
      const isDeceased = deceasedValue === true || deceasedValue === 'true' || deceasedValue === 1 || !!deathDate;
      
      let avatarUrl = personData.avatar || personData.avatarUrl || personData.image || personData.photo || null;
      
      if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
        try {
          const url = new URL(avatarUrl);
          if (!url.search || url.hostname.includes('thispersondoesnotexist.com')) {
            const separator = url.search ? '&' : '?';
            avatarUrl = `${avatarUrl}${separator}cb=${Date.now()}-${Math.random().toString(36).substring(7)}`;
          }
        } catch (e) {
          const separator = avatarUrl.includes('?') ? '&' : '?';
          avatarUrl = `${avatarUrl}${separator}cb=${Date.now()}-${Math.random().toString(36).substring(7)}`;
        }
      }
      
      const hasAvatar = avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '' && avatarUrl !== 'null' && avatarUrl !== 'undefined';
      
      card.outerHTML = (`
      <div class="card ${genderClass} ${isMain ? 'card-main' : ''} ${isDeceased ? 'card-deceased' : ''}">
        <div class="card-avatar" style="border: 6px solid ${borderColor}; box-sizing: border-box;">
          ${isDeceased ? '<div class="card-avatar-deceased-overlay"></div>' : ''}
          <div class="card-avatar-white-ring"></div>
          <div class="card-avatar-inner">
            ${hasAvatar 
              ? `<img src="${avatarUrl}" alt="${fullName}" class="card-avatar-image" />`
              : `<div class="card-initials">${initials}</div>`
            }
          </div>
        </div>
        <div class="card-label">${fullName}</div>
      </div>
      `);
      
      this.addEventListener('click', e => {
        if (f3Chart.cleanupDecorations) {
          f3Chart.cleanupDecorations();
        }
        f3Chart.updateMainId(d.data.id);
        f3Chart.updateTree({});
      });
    };
  };
}

