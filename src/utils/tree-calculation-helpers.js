/**
 * Tree calculation helper functions
 * These functions are used for tree layout calculations but are kept in extensions
 * to avoid modifying the core library files
 */

/**
 * Check if two hierarchy nodes share the same child (descendant)
 * For ancestry nodes, this determines if they're from the same branch or different branches
 * 
 * @param {Object} a - First hierarchy node
 * @param {Object} b - Second hierarchy node
 * @returns {boolean} True if they share at least one child
 */
export function sameChild(a, b) {
  // First check hierarchy children if available
  if (a.children && b.children && a.children.length > 0 && b.children.length > 0) {
    const childrenA = a.children.map((c) => c.data?.id).filter(Boolean);
    const childrenB = b.children.map((c) => c.data?.id).filter(Boolean);
    if (childrenA.some(id => childrenB.includes(id))) return true;
  }
  // Fallback: check data relationships directly
  const childrenA = a.data?.rels?.children || [];
  const childrenB = b.data?.rels?.children || [];
  if (childrenA.length === 0 || childrenB.length === 0) {
    return false; // If no children in data, consider them different branches
  }
  // Check if any child is the same
  return childrenA.some(id => childrenB.includes(id));
}

/**
 * Check if two nodes are spouses of the same person
 * This is useful for ancestry nodes that are both spouses of the same ancestor
 * 
 * @param {Object} a - First hierarchy node
 * @param {Object} b - Second hierarchy node
 * @returns {boolean} True if they are spouses of the same person
 */
export function sameSpouse(a, b) {
  // Check if they have the same parent in the hierarchy
  if (!a.parent || !b.parent) return false;
  if (a.parent === b.parent) return true;
  // Also check if they're both spouses of the same person in the data
  const spouseA = a.data?.rels?.spouses || [];
  const spouseB = b.data?.rels?.spouses || [];
  return spouseA.some(id => spouseB.includes(id));
}

/**
 * Adjust ancestry node depths to prefer deeper relationships.
 * When a person appears at multiple levels (e.g., both as parent of main and parent of main's parent),
 * prefer the deeper level (further from main person).
 * 
 * @param {Array} tree - Array of tree data nodes
 * @param {Array} data_stash - Array of all data items
 * @param {number} level_separation - Vertical distance between levels
 */
export function adjustAncestryDepths(tree, data_stash, level_separation) {
  // For each ancestry node, check if it's a parent of any other node in the tree
  // If that child has another parent at a deeper level, adjust this node's depth to match
  tree.forEach(node => {
    if (node.is_ancestry) {
      const id = node.data.id
      
      // Find all nodes in the tree that have this person as a parent
      tree.forEach(childNode => {
        if (childNode.is_ancestry) {
          const childParents = childNode.data?.rels?.parents || []
          if (childParents.includes(id)) {
            // This node is a parent of childNode
            // Check if childNode has another parent at a deeper level
            const otherParentIds = childParents.filter(pId => pId !== id)
            otherParentIds.forEach(otherParentId => {
              const otherParent = tree.find(n => n.is_ancestry && n.data.id === otherParentId)
              if (otherParent && otherParent.depth > node.depth) {
                // The other parent is at a deeper level, so adjust this node's depth to match
                const targetDepth = otherParent.depth
                console.log(`[adjustAncestryDepths] Adjusting ${id} from depth ${node.depth} to depth ${targetDepth} (co-parent of ${childNode.data.id} with ${otherParentId} at depth ${targetDepth})`)
                node.depth = targetDepth
                // Adjust Y position to match new depth
                // Note: Y will be negated in nodePositioning, so set it positive here
                node.y = targetDepth * level_separation
              }
            })
          }
        }
      })
    }
  })
}

/**
 * Prevent sibling overlaps by ensuring all siblings are positioned on the same side.
 * When multiple sibling groups share a common parent (e.g., Elena), they should all
 * be positioned to the same side to prevent overlaps.
 * 
 * @param {Array} sorted_siblings - Array of siblings sorted by their position
 * @param {Object} main - The main person node
 * @param {number} node_separation - Horizontal spacing between nodes
 * @param {Array} x_range - [minX, maxX] range of main person and their spouses
 * @param {number} main_sorted_index - Index of main person in sorted_siblings array
 */
export function preventSiblingOverlaps(sorted_siblings, main, node_separation, x_range, main_sorted_index) {
  // Group siblings by their parent pairs
  const parentPairGroups = new Map()
  
  sorted_siblings.forEach((sib, idx) => {
    if (idx === main_sorted_index) return // Skip main person
    
    const parentIds = sib.data?.rels?.parents || []
    if (parentIds.length === 0) return
    
    // Create a unique key for the parent pair (sorted to ensure consistency)
    const pairKey = [...parentIds].sort().join('-')
    
    if (!parentPairGroups.has(pairKey)) {
      parentPairGroups.set(pairKey, [])
    }
    parentPairGroups.get(pairKey).push(sib)
  })
  
  // If there's only one group, no need to prevent overlaps
  if (parentPairGroups.size <= 1) {
    return
  }
  
  console.log(`[preventSiblingOverlaps] Found ${parentPairGroups.size} sibling groups, ensuring no overlaps`)
  
  // Find which group contains the main person (the clicked person)
  const mainParentIds = main.data?.rels?.parents || []
  const mainPairKey = mainParentIds.length > 0 ? [...mainParentIds].sort().join('-') : null
  const mainGroupKey = mainPairKey && parentPairGroups.has(mainPairKey) ? mainPairKey : null
  
  // Convert groups map to array and sort groups by the first sibling's original position
  // This maintains the original order of groups while keeping siblings within each group together
  const groupsArray = Array.from(parentPairGroups.entries()).map(([pairKey, siblings]) => ({
    pairKey,
    siblings: siblings.sort((a, b) => {
      const aIdx = sorted_siblings.findIndex(s => s === a)
      const bIdx = sorted_siblings.findIndex(s => s === b)
      return aIdx - bIdx
    }),
    isMainGroup: pairKey === mainGroupKey
  }))
  
  // Sort groups: main person's group first, then others by their first sibling's position
  groupsArray.sort((a, b) => {
    if (a.isMainGroup && !b.isMainGroup) return -1
    if (!a.isMainGroup && b.isMainGroup) return 1
    const aFirstIdx = sorted_siblings.findIndex(s => s === a.siblings[0])
    const bFirstIdx = sorted_siblings.findIndex(s => s === b.siblings[0])
    return aFirstIdx - bFirstIdx
  })
  
  // Position main person's group on the LEFT, all other groups on the RIGHT
  const leftGroups = groupsArray.filter(g => g.isMainGroup)
  const rightGroups = groupsArray.filter(g => !g.isMainGroup)
  
  // Position left groups (main person's group) - from right to left
  if (leftGroups.length > 0) {
    let current_x = (x_range[0] ?? main.x) - node_separation
    // Process in reverse order to position leftmost first
    for (let i = leftGroups.length - 1; i >= 0; i--) {
      const group = leftGroups[i]
      // Process siblings in reverse order within group (excluding main person)
      for (let j = group.siblings.length - 1; j >= 0; j--) {
        const sib = group.siblings[j]
        if (sib.data.id === main.data.id) continue // Skip main person
        sib.x = current_x
        current_x -= node_separation
      }
      console.log(`[preventSiblingOverlaps] Left group (${group.pairKey}): positioned ${group.siblings.filter(s => s.data.id !== main.data.id).length} siblings to the left`)
    }
  }
  
  // Position right groups (all other groups) - from left to right
  if (rightGroups.length > 0) {
    let current_x = (x_range[1] ?? main.x) + node_separation
    rightGroups.forEach((group, groupIdx) => {
      group.siblings.forEach((sib) => {
        sib.x = current_x
        current_x += node_separation
      })
      console.log(`[preventSiblingOverlaps] Right group ${groupIdx} (${group.pairKey}): positioned ${group.siblings.length} siblings to the right`)
    })
  }
  
  console.log(`[preventSiblingOverlaps] Positioned ${leftGroups.length} group(s) on left, ${rightGroups.length} group(s) on right`)
}


