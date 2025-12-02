/**
 * Reusable utilities for family chart examples
 * Extracted from 12-figma-aligned-styling.html
 */

import * as d3 from "d3";

/**
 * Card width constant - defines the width of a person node
 * All spacing is measured in units of this card width
 */
export const CARD_WIDTH = 80; // Width of a person node in pixels

/**
 * Default chart spacing configuration
 * Used across all scenarios and components for consistent spacing
 * Spacing values are in units where 1 unit = 1 card width (CARD_WIDTH pixels)
 * The spacing value represents the gap between people, so center-to-center = CARD_WIDTH + (spacing × CARD_WIDTH)
 * Example: spacing = 1 means gap = 80px, so center-to-center = 80 + 80 = 160px
 */
export const DEFAULT_CHART_SPACING = {
  cardXSpacing: 1, // Horizontal spacing: 1 unit = 1 card width gap between people
  cardYSpacing: 1, // Vertical spacing: 1 unit = 1 card width gap between people
  transitionTime: 1000, // Animation transition time in milliseconds
  progenyDepth: 10, // Maximum depth to show descendants
  cardOffsetX: 10, // Horizontal offset for card positioning (pixels, positive = right, negative = left)
  cardOffsetY: 10, // Vertical offset for card positioning (pixels, positive = down, negative = up)
};

/**
 * Configure chart with default spacing and settings
 * @param {Object} f3Chart - The f3 chart instance
 * @param {Object} options - Optional overrides for spacing (values in card-width units, where 1 unit = 1 card width gap)
 * @returns {Object} The configured chart instance
 */
export function configureChartSpacing(f3Chart, options = {}) {
  const spacing = { ...DEFAULT_CHART_SPACING, ...options };
  // Convert card-width units to pixels when setting on the chart
  // spacing value represents the gap in card-width units
  // center-to-center = one card width + gap = CARD_WIDTH + (spacing × CARD_WIDTH)
  const xSpacing = CARD_WIDTH + (spacing.cardXSpacing * CARD_WIDTH);
  const ySpacing = CARD_WIDTH + (spacing.cardYSpacing * CARD_WIDTH);
  console.log('[configureChartSpacing] Setting spacing:', {
    cardXSpacing: spacing.cardXSpacing,
    cardYSpacing: spacing.cardYSpacing,
    xSpacingPx: xSpacing,
    ySpacingPx: ySpacing,
    cardWidth: CARD_WIDTH,
    cardOffsetX: spacing.cardOffsetX,
    cardOffsetY: spacing.cardOffsetY
  });
  
  const chart = f3Chart
    .setTransitionTime(spacing.transitionTime)
    .setCardXSpacing(xSpacing)
    .setCardYSpacing(ySpacing);
  
  // Store card offsets on chart for use in updateTree calls
  chart._cardOffsetX = spacing.cardOffsetX;
  chart._cardOffsetY = spacing.cardOffsetY;
  
  return chart;
}

/**
 * Configure card position offsets for fine-tuning alignment with link lines
 * @param {Object} f3Chart - The f3 chart instance
 * @param {Object} offsets - Offset values in pixels
 * @param {number} offsets.x - Horizontal offset (positive = right, negative = left)
 * @param {number} offsets.y - Vertical offset (positive = down, negative = up)
 * @returns {Object} The configured chart instance
 */
export function configureCardOffsets(f3Chart, offsets = {}) {
  const offsetX = offsets.x !== undefined ? offsets.x : (f3Chart._cardOffsetX || 0);
  const offsetY = offsets.y !== undefined ? offsets.y : (f3Chart._cardOffsetY || 0);
  
  f3Chart._cardOffsetX = offsetX;
  f3Chart._cardOffsetY = offsetY;
  
  console.log('[configureCardOffsets] Setting card offsets:', {
    offsetX,
    offsetY
  });
  
  // Apply offsets to the current tree
  if (f3Chart.updateTree) {
    f3Chart.updateTree({
      cardOffsetX: offsetX,
      cardOffsetY: offsetY
    });
  }
  
  return f3Chart;
}

/**
 * Normalize gender values to M, F, or NB
 */
export function normalizeGender(gender) {
  // Preserve null/undefined for unspecified gender (will show grey/blue in chart)
  if (gender === null || gender === undefined || gender === '') return null;
  const g = String(gender).trim().toUpperCase();
  if (g === 'M' || g === 'MALE') return 'M';
  if (g === 'F' || g === 'FEMALE') return 'F';
  if (g === 'NB' || g === 'NON-BINARY' || g === 'NONBINARY' || g === 'X' || g === 'N') return 'NB';
  // If gender value exists but doesn't match known values, preserve null instead of defaulting to M
  return null;
}

/**
 * Generate initials from structured name data
 * Rules:
 * - First letter of first word in first name
 * - First letter of first word in last name (or maiden name if present)
 * - Maiden names take precedence over other last names
 * - For hyphenated last names: only first part before hyphen
 * - If no last name: first initial only (duplicated)
 * - No middle names, suffixes, or nicknames
 * 
 * @param {Object|string} nameData - Either structured object with firstName/lastName/maidenName, or string (legacy fallback)
 * @param {string} [nameData.firstName] - First name
 * @param {string} [nameData.lastName] - Last name
 * @param {string} [nameData.maidenName] - Maiden name (takes precedence over lastName)
 * @param {string} [nameData.fullName] - Full name (fallback only)
 * @returns {string} Two-letter initials in uppercase
 */
export function generateInitials(nameData) {
  // Legacy support: if string is passed, try to parse it
  if (typeof nameData === 'string') {
    const trimmed = nameData.trim();
    if (!trimmed) return '??';
    const parts = trimmed.split(/\s+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      // First letter of first word + first letter of last word
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1) {
      // Single name: use first initial only (not duplicated)
      return parts[0][0].toUpperCase();
    }
    return '??';
  }
  
  // Structured data approach
  if (!nameData || (typeof nameData !== 'object')) {
    return '??';
  }
  
  const firstName = (nameData.firstName || nameData['first name'] || nameData.first_name || '').trim();
  const lastName = (nameData.lastName || nameData['last name'] || nameData.last_name || '').trim();
  const maidenName = (nameData.maidenName || nameData['maiden name'] || nameData.maiden_name || '').trim();
  
  // Get first word of first name (ignore middle names, suffixes, etc.)
  const firstWord = firstName ? firstName.split(/\s+/).filter(Boolean)[0] : '';
  const firstInitial = firstWord ? firstWord[0].toUpperCase() : '';
  
  // Priority: maiden name > last name > none
  const lastSource = maidenName || lastName;
  
  if (!lastSource) {
    // No last name: use first initial only (not duplicated)
    return firstInitial || '??';
  }
  
  // Get first word of last name (handle hyphenated names: use first part only)
  const lastFirstPart = lastSource.split('-')[0].trim();
  const lastWord = lastFirstPart ? lastFirstPart.split(/\s+/).filter(Boolean)[0] : '';
  const lastInitial = lastWord ? lastWord[0].toUpperCase() : '';
  
  // If we have both initials, combine them
  if (firstInitial && lastInitial) {
    return `${firstInitial}${lastInitial}`;
  }
  
  // Fallback: if we only have first initial, return it (not duplicated)
  if (firstInitial) {
    return firstInitial;
  }
  
  // Final fallback
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
 * Default sort function for siblings/children: age (oldest first), then alphabetical
 * Used within parent pair groups for sibling ordering
 * 
 * @param {Object} a - First person data (TreeDatum.data or Datum)
 * @param {Object} b - Second person data (TreeDatum.data or Datum)
 * @returns {number} Sort comparison result
 */
export function defaultSortByAge(a, b) {
  // Handle both TreeDatum format (a.data) and Datum format (a directly)
  const aData = a.data?.data || a.data || a;
  const bData = b.data?.data || b.data || b;
  
  // Extract birth year/date
  const getBirthYear = (data) => {
    if (data.birthday) {
      try {
        const date = new Date(data.birthday);
        if (!isNaN(date.getTime())) return date.getFullYear();
      } catch {}
    }
    if (data.birth_year) {
      const year = parseInt(data.birth_year, 10);
      if (!isNaN(year)) return year;
    }
    if (data.birthYear) {
      const year = parseInt(data.birthYear, 10);
      if (!isNaN(year)) return year;
    }
    return null;
  };
  
  const aYear = getBirthYear(aData);
  const bYear = getBirthYear(bData);
  
  // Both have ages: sort by age (oldest first = smaller year first)
  if (aYear && bYear) {
    return aYear - bYear;
  }
  
  // Only one has age: age comes first
  if (aYear && !bYear) return -1;
  if (!aYear && bYear) return 1;
  
  // Neither has age: alphabetical by first name, then last name
  const getFirstName = (data) => {
    return (data.first_name || data['first name'] || data.full_name || '').split(/\s+/)[0] || '';
  };
  const getLastName = (data) => {
    const lastName = data.last_name || data['last name'] || data.maiden_name || data['maiden name'] || '';
    return lastName.split(/\s+/)[0] || '';
  };
  
  const aFirstName = getFirstName(aData);
  const bFirstName = getFirstName(bData);
  const nameCompare = aFirstName.localeCompare(bFirstName);
  if (nameCompare !== 0) return nameCompare;
  
  // If first names are same, compare last names
  const aLastName = getLastName(aData);
  const bLastName = getLastName(bData);
  return aLastName.localeCompare(bLastName);
}

/**
 * Sort partners by recency: most recent closest to person, least recent farthest away
 * Priority: manual_sequence > relationship_sequence > status > dates
 * 
 * @param {string} partnerIdA - First partner ID
 * @param {string} partnerIdB - Second partner ID
 * @param {Object} relationshipStatuses - Relationship statuses object keyed by partner ID
 * @returns {number} Sort comparison result (negative = A before B, positive = B before A)
 */
export function defaultSortPartnersByRecency(partnerIdA, partnerIdB, relationshipStatuses) {
  const statusA = relationshipStatuses[partnerIdA] || {};
  const statusB = relationshipStatuses[partnerIdB] || {};
  
  // PRIORITY 1: Manual sequence (user overrides via drag-and-drop)
  // HIGHER numbers = more recent = closer to person
  if (statusA.manual_sequence != null && statusB.manual_sequence != null) {
    return statusB.manual_sequence - statusA.manual_sequence; // DESCENDING (higher first)
  }
  if (statusA.manual_sequence != null) return -1; // A has sequence, B doesn't → A first
  if (statusB.manual_sequence != null) return 1;  // B has sequence, A doesn't → B first
  
  // PRIORITY 2: AI-extracted relationship_sequence (from temporal language)
  // HIGHER numbers = more recent = closer to person
  if (statusA.relationship_sequence != null && statusB.relationship_sequence != null) {
    return statusB.relationship_sequence - statusA.relationship_sequence; // DESCENDING
  }
  if (statusA.relationship_sequence != null) return -1;
  if (statusB.relationship_sequence != null) return 1;
  
  // PRIORITY 3: Status-based sorting (current partners first, then former)
  const statusTextA = statusA.status || '';
  const statusTextB = statusB.status || '';
  
  // Current relationships (NOT widowed/divorced/annulled/former)
  const isCurrentA = ['married', 'current', 'partner-current', 'committed', 'domestic-partnership', 
                      'civil-union', 'engaged', 'dating', 'cohabiting', 'separated'].includes(statusTextA);
  const isCurrentB = ['married', 'current', 'partner-current', 'committed', 'domestic-partnership', 
                      'civil-union', 'engaged', 'dating', 'cohabiting', 'separated'].includes(statusTextB);
  
  // Current relationships come FIRST (closest to person)
  if (isCurrentA && !isCurrentB) return -1;
  if (!isCurrentA && isCurrentB) return 1;
  
  // PRIORITY 4: Date-based sorting (most recent first)
  const getDateValue = (status) => {
    // Try start_date, then end_date, then created_at
    if (status.start_date) {
      try {
        const date = new Date(status.start_date);
        if (!isNaN(date.getTime())) return date.getTime();
      } catch {}
    }
    if (status.end_date) {
      try {
        const date = new Date(status.end_date);
        if (!isNaN(date.getTime())) return date.getTime();
      } catch {}
    }
    if (status.created_at) {
      try {
        const date = new Date(status.created_at);
        if (!isNaN(date.getTime())) return date.getTime();
      } catch {}
    }
    return null;
  };
  
  const dateA = getDateValue(statusA);
  const dateB = getDateValue(statusB);
  
  if (dateA && dateB) {
    // Most recent date first (higher timestamp = closer to person)
    return dateB - dateA; // DESCENDING
  }
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  
  // PRIORITY 5: Maintain original order if no sorting criteria
  return 0;
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
 * Handles both array format: [{...}] and object format: { treeData: [{...}] }
 */
export function transformScenarioData(scenarioData) {
  // Handle both array format and object format with treeData property
  const treeDataArray = Array.isArray(scenarioData) 
    ? scenarioData 
    : (scenarioData.treeData || []);
  
  if (!Array.isArray(treeDataArray)) {
    console.error('[transformScenarioData] Invalid data format:', scenarioData);
    return [];
  }
  
  const transformed = treeDataArray.map(person => {
    const personData = person.data?.data || person.data || {};
    const rels = person.rels || person.data?.rels || {};
    
    // Normalize field names - handle both "first name" and "first_name" formats
    const firstName = personData.first_name || personData["first name"] || '';
    const lastName = personData.last_name || personData["last name"] || '';
    const maidenName = personData.maiden_name || personData["maiden name"] || '';
    const preferredName = personData.preferred_name || personData["preferred name"] || '';
    const suffix = personData.suffix || personData["suffix"] || '';
    const fullName = personData.full_name || 
                     (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || 'Unknown');
    
    // Generate initials from structured fields (maiden name takes precedence)
    const initials = generateInitials({
      firstName: firstName,
      lastName: lastName,
      maidenName: maidenName,
      fullName: fullName // fallback only
    });
    
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
    // Check all possible paths: person.data.data.gender, person.data.gender, personData.gender
    // Preserve null/undefined for unspecified gender (will show grey/blue)
    // Use explicit null checks to avoid using empty strings or other falsy values
    let genderValue = null;
    if (person.data?.data?.gender !== null && person.data?.data?.gender !== undefined && person.data?.data?.gender !== '') {
      genderValue = person.data.data.gender;
    } else if (person.data?.gender !== null && person.data?.gender !== undefined && person.data?.gender !== '') {
      genderValue = person.data.gender;
    } else if (personData.gender !== null && personData.gender !== undefined && personData.gender !== '') {
      genderValue = personData.gender;
    }
    let gender = normalizeGender(genderValue);
    
    // Debug logging for gender extraction in transformScenarioData (only log for unknown genders)
    if (gender === null && personData.id) {
      console.log('🔍 [transformScenarioData] Gender extraction debug:', {
        personId: personData.id,
        hasDataData: !!person.data?.data,
        hasData: !!person.data,
        genderInDataData: person.data?.data?.gender,
        genderInData: person.data?.gender,
        genderInPersonData: personData.gender,
        genderValue,
        normalizedGender: gender
      });
    }
    
    // Determine if deceased - check all possible paths and auto-true if death_date exists
    const deceasedValue = person.data?.data?.deceased || 
                         person.data?.deceased || 
                         personData.deceased || 
                         false;
    const deathDate = person.data?.data?.death_date || 
                     person.data?.data?.deathDate || 
                     person.data?.data?.died || 
                     person.data?.data?.deceased_date ||
                     person.data?.death_date || 
                     person.data?.deathDate || 
                     person.data?.died || 
                     person.data?.deceased_date ||
                     personData.death_date || 
                     personData.deathDate || 
                     personData.died || 
                     personData.deceased_date ||
                     null;
    let deceased = deceasedValue;
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
        first_name: firstName || fullName.split(/\s+/)[0] || 'Unknown',
        last_name: lastName || (fullName.split(/\s+/).length > 1 ? fullName.split(/\s+/).slice(1).join(' ') : ''),
        preferred_name: preferredName,
        suffix: suffix,
        full_name: fullName,
        deceased: deceased,
        death_date: deathDate || null,
        label: fullName,
        initials: initials,
        relationshipStatuses: relationshipStatuses,
        avatar: personData.avatar || personData.avatarUrl || personData.image || null,
        adopted: adopted
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
  
  // Removed stepsibling logic - children display using base behavior only
  return transformed;
}

/**
 * Create a modifyTreeHierarchy function (no-op - base behavior only)
 * Removed stepsibling logic - children display using base behavior
 */
export function createStepsiblingModifier(allData) {
  return function modifyTreeHierarchy(tree, is_ancestry) {
    // No-op - base behavior only, no custom modifications
    return;
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
      const status = sourceRelStatuses[targetId].status;
      // Filter out deprecated statuses: current, former, partner-current
      if (status !== 'current' && status !== 'former' && status !== 'partner-current') {
        relationshipStatus = status;
      }
    }
    if (!relationshipStatus && targetRelStatuses[sourceId] && targetRelStatuses[sourceId].status) {
      const status = targetRelStatuses[sourceId].status;
      // Filter out deprecated statuses: current, former, partner-current
      if (status !== 'current' && status !== 'former' && status !== 'partner-current') {
        relationshipStatus = status;
      }
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
 * Shared debounce state for card clicks to prevent rapid-fire clicks
 */
const cardClickDebounce = {
  timeouts: new Map(),
  processing: new Set(),
  lastClickTime: 0
};

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
      
      // Determine gender - normalize from multiple possible sources
      // Check all possible paths: d.data.data.gender, d.data.gender, personData.gender
      // Preserve null/undefined for unspecified gender (will show grey/blue)
      // Use explicit null checks to avoid using empty strings or other falsy values
      let genderValue = null;
      if (d.data?.data?.gender !== null && d.data?.data?.gender !== undefined && d.data?.data?.gender !== '') {
        genderValue = d.data.data.gender;
      } else if (d.data?.gender !== null && d.data?.gender !== undefined && d.data?.gender !== '') {
        genderValue = d.data.gender;
      } else if (personData.gender !== null && personData.gender !== undefined && personData.gender !== '') {
        genderValue = personData.gender;
      }
      let gender = normalizeGender(genderValue);
      
      // Debug logging for gender extraction (only log for unknown genders to avoid spam)
      if (gender === null && personId !== 'unknown') {
        console.log('🔍 [CardRenderer] Gender extraction debug:', {
          personId,
          hasDataData: !!d.data?.data,
          hasData: !!d.data,
          genderInDataData: d.data?.data?.gender,
          genderInData: d.data?.gender,
          genderInPersonData: personData.gender,
          genderValue,
          normalizedGender: gender,
          genderClass: getGenderClass(gender)
        });
      }
      
      // Check for preferred_name first, then full_name/label, then fall back to first_name + last_name
      let fullName = personData.preferred_name || personData['preferred name'] || 
                      personData.full_name || personData.label ||
                      (personData['first name'] && personData['last name'] 
                        ? `${personData['first name']} ${personData['last name']}`.trim()
                        : personData['first name'] || personData['last name'] || 'Unknown');
      
      // Add suffix if present (e.g., "Jr.", "Sr.", "III")
      const suffix = personData.suffix || personData['suffix'] || d.data?.suffix || d.data?.data?.suffix;
      if (suffix && suffix.trim() !== '') {
        fullName = `${fullName} ${suffix.trim()}`;
      }
      
      // Extract structured name fields for initials (don't use fullName which may include suffixes)
      const firstName = personData.first_name || personData['first name'] || '';
      const lastName = personData.last_name || personData['last name'] || '';
      const maidenName = personData.maiden_name || personData['maiden name'] || '';
      
      // Generate initials from structured fields (maiden name takes precedence)
      const initials = personData.initials || generateInitials({
        firstName: firstName,
        lastName: lastName,
        maidenName: maidenName,
        fullName: fullName // fallback only
      });
      const borderColor = getGenderBorderColor(gender);
      const genderClass = getGenderClass(gender);
      const isMain = d.data?.main || d.main || false;
      
      // Check deceased status from all possible locations
      // Priority: d.data.deceased > d.data.data.deceased > personData.deceased
      const deceasedValue = d.data?.deceased !== undefined ? d.data.deceased : 
                           (d.data?.data?.deceased !== undefined ? d.data.data.deceased : 
                           (personData.deceased !== undefined ? personData.deceased : false));
      const deathDate = d.data?.death_date || d.data?.data?.death_date || personData.death_date || personData.deathDate;
      const isDeceased = deceasedValue === true || deceasedValue === 'true' || deceasedValue === 1 || deceasedValue === '1' || !!deathDate;
      
      // Debug logging for deceased status (check all deceased people)
      if (process.env.NODE_ENV === 'development' && isDeceased) {
        console.log('🔴 [CardRenderer] Deceased person detected:', {
          personId,
          fullName,
          'd.data.deceased': d.data?.deceased,
          'd.data.data.deceased': d.data?.data?.deceased,
          'personData.deceased': personData.deceased,
          deceasedValue,
          deathDate,
          isDeceased,
          hasDataData: !!d.data?.data,
          hasData: !!d.data,
          willRenderOverlay: isDeceased
        });
      }
      
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
      
      // Store old click handler if it exists
      const oldClickHandler = this._cardClickHandler;
      
      // Remove old click handler before updating
      if (oldClickHandler) {
        this.removeEventListener('click', oldClickHandler);
      }
      
      card.outerHTML = (`
      <div class="card ${genderClass} ${isMain ? 'card-main' : ''} ${isDeceased ? 'card-deceased' : ''}" data-person-id="${personId}">
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
      
      // Create debounced click handler
      // Note: On mobile, touch events handle interactions, so this mainly handles desktop clicks
      const clickHandler = (e) => {
        // Skip if this click was triggered by a touch event (mobile)
        // Touch events are handled separately in FamilyTreeChartV2
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) {
          return;
        }
        
        e.stopPropagation();
        
        const now = Date.now();
        const timeSinceLastClick = now - cardClickDebounce.lastClickTime;
        
        // Ignore clicks if one is already processing
        if (cardClickDebounce.processing.has(personId)) {
          return;
        }
        
        // Clear any existing timeout for this person
        if (cardClickDebounce.timeouts.has(personId)) {
          clearTimeout(cardClickDebounce.timeouts.get(personId));
        }
        
        // Debounce: only process if enough time has passed since last click
        const debounceDelay = timeSinceLastClick < 500 ? 200 : 50;
        
        const timeoutId = setTimeout(() => {
          try {
            cardClickDebounce.processing.add(personId);
            cardClickDebounce.lastClickTime = Date.now();
            
            if (f3Chart.cleanupDecorations) {
              f3Chart.cleanupDecorations();
            }
            f3Chart.updateMainId(d.data.id);
            f3Chart.updateTree({});
          } catch (err) {
            console.error('[createCardRenderer] Error handling card click:', err);
          } finally {
            // Remove from processing set after a delay
            setTimeout(() => {
              cardClickDebounce.processing.delete(personId);
              cardClickDebounce.timeouts.delete(personId);
            }, 500);
          }
        }, debounceDelay);
        
        cardClickDebounce.timeouts.set(personId, timeoutId);
      };
      
      // Store handler reference for cleanup
      this._cardClickHandler = clickHandler;
      
      // Add click listener to the container element (this)
      this.addEventListener('click', clickHandler);
    };
  };
}

