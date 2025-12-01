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
  
  // Special case: If there are exactly 2 groups total, justify them in opposite directions (left/right)
  // This handles cases like Mary I where her group and half-siblings' groups would overlap
  // Neither group should be centered - both should be justified left/right
  // Main person's group (same parent pair as main person) goes LEFT, other groups go RIGHT
  const totalGroups = groupsArray.length;
  
  // Handle 2-group case: always justify both groups left/right, never center
  if (totalGroups === 2) {
    // Exactly 2 groups: identify which one matches the main person's parent pair
    // That group (Henry's kids with same parents as main person) goes LEFT
    // The other group (half-siblings with different parent pairs) goes RIGHT
    let leftGroup, rightGroup;
    
    if (mainPairKey) {
      // Find group that matches main person's parent pair - this goes LEFT
      const matchingGroup = groupsArray.find(g => g.pairKey === mainPairKey);
      if (matchingGroup) {
        // Main person's group found - put it LEFT, others RIGHT
        leftGroup = matchingGroup;
        rightGroup = groupsArray.find(g => g.pairKey !== mainPairKey);
        console.log(`[preventSiblingOverlaps] 2-group case: Found main person's group (${mainPairKey}) - will position LEFT`);
      } else {
        // Main person's parent pair not in groups (main person is not a sibling, like Mary I)
        // Put ALL sibling groups to the RIGHT, leaving main person (and her ancestry link) on the LEFT
        // This means: no leftGroup, both groups go RIGHT
        leftGroup = null;
        rightGroup = null; // Will handle both groups going RIGHT
        console.log(`[preventSiblingOverlaps] 2-group case: Main person's group (${mainPairKey}) not in sibling groups - all sibling groups will go RIGHT`);
      }
    } else {
      // No main pair key - use isMainGroup flag or fallback
      const mainGroup = groupsArray.find(g => g.isMainGroup);
      if (mainGroup) {
        leftGroup = mainGroup;
        rightGroup = groupsArray.find(g => g !== mainGroup);
      } else {
        // Fallback: first group LEFT, second group RIGHT
        leftGroup = groupsArray[0];
        rightGroup = groupsArray[1];
      }
    }
    
    if (leftGroup && rightGroup) {
      // Main person's group (Henry's kids with same parents) goes LEFT
      const leftStartX = (x_range[0] ?? main.x) - node_separation;
      let left_x = leftStartX;
      for (let j = leftGroup.siblings.length - 1; j >= 0; j--) {
        const sib = leftGroup.siblings[j];
        sib.x = left_x;
        left_x -= node_separation;
      }
      console.log(`[preventSiblingOverlaps] 2-group case: Main person's group (${leftGroup.pairKey}) positioned to LEFT starting at ${leftStartX.toFixed(1)}`);
      
      // Other groups (half-siblings with different parent pairs) go RIGHT
      const rightStartX = (x_range[1] ?? main.x) + node_separation;
      let right_x = rightStartX;
      rightGroup.siblings.forEach((sib) => {
        sib.x = right_x;
        right_x += node_separation;
      });
      console.log(`[preventSiblingOverlaps] 2-group case: Other group (${rightGroup.pairKey}) positioned to RIGHT starting at ${rightStartX.toFixed(1)}`);
      
      console.log(`[preventSiblingOverlaps] 2-group justification: main person's group LEFT, other groups RIGHT`);
      return; // Early return for 2-group case
    } else if (!leftGroup && mainPairKey) {
      // Main person's group not in sibling groups - put ALL sibling groups to the LEFT
      // This leaves the main person (and her ancestry link) on the RIGHT side
      const leftStartX = (x_range[0] ?? main.x) - node_separation;
      let left_x = leftStartX;
      // Process groups in reverse order to position leftmost first
      for (let i = groupsArray.length - 1; i >= 0; i--) {
        const group = groupsArray[i];
        for (let j = group.siblings.length - 1; j >= 0; j--) {
          const sib = group.siblings[j];
          sib.x = left_x;
          left_x -= node_separation;
        }
        console.log(`[preventSiblingOverlaps] 2-group case: Group ${i} (${group.pairKey}) positioned to LEFT starting at ${leftStartX.toFixed(1)} (main person's group not in siblings)`);
      }
      console.log(`[preventSiblingOverlaps] 2-group justification: all sibling groups LEFT (main person stays RIGHT)`);
      return; // Early return for 2-group case
    }
  }
  
  // Default behavior for 3+ groups: Position main person's group on the LEFT, all other groups on the RIGHT
  const leftGroups = groupsArray.filter(g => g.isMainGroup)
  const rightGroups = groupsArray.filter(g => !g.isMainGroup)
  
  // If main person's group is not found in sibling groups, put ALL groups to the LEFT
  // This leaves the main person (and her ancestry link) on the RIGHT side
  if (leftGroups.length === 0 && mainPairKey) {
    // Main person's group not in sibling groups - put ALL sibling groups to the LEFT
    const leftStartX = (x_range[0] ?? main.x) - node_separation;
    let left_x = leftStartX;
    // Process groups in reverse order to position leftmost first
    for (let i = groupsArray.length - 1; i >= 0; i--) {
      const group = groupsArray[i];
      for (let j = group.siblings.length - 1; j >= 0; j--) {
        const sib = group.siblings[j];
        sib.x = left_x;
        left_x -= node_separation;
      }
      console.log(`[preventSiblingOverlaps] Group ${i} (${group.pairKey}) positioned to LEFT starting at ${leftStartX.toFixed(1)} (main person's group not in siblings)`);
    }
    console.log(`[preventSiblingOverlaps] All groups LEFT (main person stays RIGHT)`);
    return;
  }
  
  // Position left groups (main person's group) - from right to left
  if (leftGroups.length > 0) {
    let current_x = (x_range[0] ?? main.x) - node_separation;
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
    let current_x = (x_range[1] ?? main.x) + node_separation;
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

/**
 * Justify child groups in opposite directions when there are exactly 2 groups.
 * When a parent pair has exactly 2 child groups (detected by having both ancestry and progeny children),
 * they should be justified left/right instead of centered to prevent link collisions.
 * 
 * This handles cases like when Mary I is selected:
 * - Group 1: Mary I (has ancestry link going up to parents)
 * - Group 2: Elizabeth I, Edward VI (progeny links going down from parents)
 * 
 * @param {Array} tree - Array of tree data nodes
 * @param {number} node_separation - Horizontal spacing between nodes
 */
export function justifyTwoChildGroups(tree, node_separation) {
  // Group children by their parent pairs
  // We need to detect when a parent pair has children in BOTH directions (ancestry and progeny)
  const parentPairGroups = new Map();
  
  tree.forEach(node => {
    const parentIds = node.data?.rels?.parents || [];
    if (parentIds.length === 0) return;
    
    const pairKey = [...parentIds].sort().join('-');
    if (!parentPairGroups.has(pairKey)) {
      parentPairGroups.set(pairKey, {
        hasAncestryChild: false,  // Has at least one child with ancestry link
        hasProgenyChild: false,   // Has at least one child with progeny link
        ancestryChildren: [],     // Nodes that are children via ancestry links
        progenyChildren: []       // Nodes that are children via progeny links
      });
    }
    
    const group = parentPairGroups.get(pairKey);
    
    // Check if this node is a child of the parent pair
    // If node has parents matching this pair, it's a child
    const nodeParentIds = [...(node.data?.rels?.parents || [])].sort();
    if (nodeParentIds.join('-') === pairKey) {
      // This node is a child of the parent pair
      // Check if it has an ancestry link (going up) or progeny link (going down)
      // by checking if it's in the ancestry or progeny side of the tree
      if (node.is_ancestry) {
        group.hasAncestryChild = true;
        group.ancestryChildren.push(node);
      } else {
        group.hasProgenyChild = true;
        group.progenyChildren.push(node);
      }
    }
  });
  
  // For each parent pair with exactly 2 groups (both ancestry and progeny children), justify them left/right
  parentPairGroups.forEach((groups, pairKey) => {
    const numGroups = (groups.hasAncestryChild ? 1 : 0) + (groups.hasProgenyChild ? 1 : 0);
    
    if (numGroups === 2) {
      console.log(`[justifyTwoChildGroups] Found 2 child groups for parent pair ${pairKey}: ancestry=${groups.ancestryChildren.length}, progeny=${groups.progenyChildren.length}`);
      
      // Find the parent nodes to get their X position
      const parentIds = pairKey.split('-');
      const parents = tree.filter(n => parentIds.includes(n.data.id));
      if (parents.length === 0) return;
      
      // Calculate parent midpoint X
      const parentX = parents.reduce((sum, p) => sum + (p.x || 0), 0) / parents.length;
      
      // Justify groups in opposite directions
      // Ancestry children (going up) go LEFT, progeny children (going down) go RIGHT
      if (groups.hasAncestryChild && groups.ancestryChildren.length > 0) {
        // Calculate average X of ancestry children, then shift left
        const avgAncestryX = groups.ancestryChildren.reduce((sum, n) => sum + (n.x || 0), 0) / groups.ancestryChildren.length;
        const targetX = parentX - node_separation * 1.5; // Shift left
        const offset = targetX - avgAncestryX;
        
        groups.ancestryChildren.forEach(node => {
          node.x = (node.x || 0) + offset;
          console.log(`[justifyTwoChildGroups] Moved ancestry child ${node.data.id} to left: ${node.x.toFixed(1)}`);
        });
      }
      
      if (groups.hasProgenyChild && groups.progenyChildren.length > 0) {
        // Calculate average X of progeny children, then shift right
        const avgProgenyX = groups.progenyChildren.reduce((sum, n) => sum + (n.x || 0), 0) / groups.progenyChildren.length;
        const targetX = parentX + node_separation * 1.5; // Shift right
        const offset = targetX - avgProgenyX;
        
        groups.progenyChildren.forEach(node => {
          node.x = (node.x || 0) + offset;
          console.log(`[justifyTwoChildGroups] Moved progeny child ${node.data.id} to right: ${node.x.toFixed(1)}`);
        });
      }
      
      console.log(`[justifyTwoChildGroups] Justified 2 groups for ${pairKey}: ancestry left, progeny right`);
    }
  });
}


