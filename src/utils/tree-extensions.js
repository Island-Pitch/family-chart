/**
 * Extension utilities for the family-chart library
 * These functions extend the tree calculation behavior without modifying core library files
 */

/**
 * Post-processes the tree to add spouses of ancestry nodes (parents)
 * This ensures that when a parent is shown, their spouse is also shown
 * (e.g., when Carol is shown as Cindy's parent, Mike should be shown as Carol's spouse)
 */
export function extendSpousesForAncestryNodes(
  tree,
  data_stash,
  node_separation,
  one_level_rels = false
) {
  for (let i = tree.length; i--;) {
    const d = tree[i]
    // Only process ancestry nodes (parents)
    if (!d.is_ancestry) continue
    
    let spouses = d.data.rels.spouses || []
    if (d._ignore_spouses) spouses = spouses.filter(sp_id => !d._ignore_spouses.includes(sp_id))
    if (spouses.length > 0) {
      if (one_level_rels && d.depth > 0) continue
      const side = d.data.data.gender === "M" ? -1 : 1;  // female on right
      d.x += spouses.length/2*node_separation*side;
      spouses.forEach((sp_id, i) => {
        // Check if spouse is already in tree
        const existingSpouse = tree.find(t => t.data.id === sp_id)
        if (existingSpouse) {
          // Spouse already in tree (e.g., as a parent), link them
          if (!d.spouses) d.spouses = []
          if (!d.spouses.includes(existingSpouse)) {
            d.spouses.push(existingSpouse)
          }
          // Set coparent relationship for ancestry nodes
          if (d.is_ancestry && !d.coparent) {
            d.coparent = existingSpouse
          }
          if (existingSpouse.is_ancestry && !existingSpouse.coparent) {
            existingSpouse.coparent = d
          }
          return
        }
        
        const spouse = {
          data: data_stash.find(d0 => d0.id === sp_id),
          added: true,
          depth: d.depth,
          spouse: d,
          x: d.x-(node_separation*(i+1))*side,
          y: d.y,
          tid: `${d.data.id}-spouse-${i}`,
          is_ancestry: d.is_ancestry, // Spouse of ancestry node is also ancestry
        }
        spouse.sx = i > 0 ? spouse.x : spouse.x + (node_separation/2)*side
        spouse.sy = i > 0 ? spouse.y : spouse.y + (node_separation/2)*side
        if (!d.spouses) d.spouses = []
        d.spouses.push(spouse)
        tree.push(spouse)
        
        // Set coparent relationship for ancestry nodes
        if (d.is_ancestry) {
          d.coparent = spouse
          spouse.coparent = d
        }
      })
    }
  }
}

/**
 * Extended findSiblings function that includes stepsiblings from the siblings array
 */
export function findSiblingsExtended(
  main,
  data_stash
) {
  const p1 = main.data.rels.parents[0]
  const p2 = main.data.rels.parents[1]
  
  // First, find siblings who share a parent (biological siblings)
  const biologicalSiblings = data_stash.filter(d => {
    if (d.id === main.data.id) return false
    if (p1 && d.rels.parents.includes(p1)) return true
    if (p2 && d.rels.parents.includes(p2)) return true
    return false
  })
  
  // Also check the siblings array from the data (includes stepsiblings we added)
  // Note: siblings may not be in the type definition, but we add it in transformScenarioData
  const mainSiblingsArray = main.data.rels.siblings || []
  const stepsiblings = data_stash.filter(d => {
    if (d.id === main.data.id) return false
    if (biologicalSiblings.find(s => s.id === d.id)) return false // Already included
    return mainSiblingsArray.includes(d.id)
  })
  
  // Combine biological siblings and stepsiblings
  return [...biologicalSiblings, ...stepsiblings]
}

/**
 * Extended addSiblingsToTree function that links stepsiblings to their actual parents
 * This ensures stepsiblings drop from their actual parents (e.g., Mike's kids drop from Mike)
 */
export function addSiblingsToTreeExtended(
  siblings,
  main,
  tree,
  node_separation
) {
  const siblings_added = []

  for (let i = 0; i < siblings.length; i++) {
    const sib = {
      data: siblings[i],
      sibling: true,
      x: 0.0,  // to be calculated in positionSiblings
      y: main.y,
      depth: main.depth-1,
      parents: []
    }

    // Find the sibling's parents in the tree
    const sibParent1Id = sib.data.rels.parents[0]
    const sibParent2Id = sib.data.rels.parents[1]
    const p1 = main.parents?.find(d => d.data.id === sibParent1Id)
    const p2 = main.parents?.find(d => d.data.id === sibParent2Id)
    
    // Check if this is a stepsibling (doesn't share any parents with main)
    const mainParentIds = main.data.rels.parents || []
    const isStepsibling = !mainParentIds.includes(sibParent1Id) && !mainParentIds.includes(sibParent2Id)
    
    if (isStepsibling) {
      // Stepsibling - find their actual parents in the tree and link to them
      // This ensures stepsiblings drop from their actual parents (e.g., Mike's kids drop from Mike)
      const sibParent1 = tree.find(d => d.data.id === sibParent1Id)
      const sibParent2 = tree.find(d => d.data.id === sibParent2Id)
      
      if (sibParent1) {
        sib.parents.push(sibParent1)
        // Also add this child to the parent's children array
        if (!sibParent1.children) sibParent1.children = []
        if (!sibParent1.children.find(c => c.data.id === sib.data.id)) {
          sibParent1.children.push(sib)
        }
      }
      if (sibParent2) {
        sib.parents.push(sibParent2)
        // Also add this child to the parent's children array
        if (!sibParent2.children) sibParent2.children = []
        if (!sibParent2.children.find(c => c.data.id === sib.data.id)) {
          sibParent2.children.push(sib)
        }
      }
      
      // Set parent reference for D3 hierarchy (needed for setupChildrenAndParents)
      if (sibParent1) {
        sib.parent = sibParent1
      } else if (sibParent2) {
        sib.parent = sibParent2
      }
    } else {
      // Biological sibling - link to shared parents
      if (p1) {
        sib.parents.push(p1)
        sib.parent = p1
      }
      if (p2) {
        sib.parents.push(p2)
        // If already has a parent, keep the first one for D3 hierarchy
        if (!sib.parent) sib.parent = p2
      }
    }
    
    tree.push(sib)
    siblings_added.push(sib)
  }

  return siblings_added
}

/**
 * Post-processes the tree to ensure stepsiblings are properly linked to their parents
 * This should be called after setupSiblings has run
 * 
 * This function ensures that stepsiblings have their parents set properly,
 * preventing errors when links are created for nodes with empty parents arrays
 */
export function extendStepsiblingParentLinks(
  tree,
  main
) {
  // Find all stepsiblings (siblings that don't share parents with main)
  const mainParentIds = main.data.rels.parents || []
  const stepsiblings = tree.filter(d => {
    if (!d.sibling) return false
    if (d.data.id === main.data.id) return false
    const sibParent1Id = d.data.rels.parents[0]
    const sibParent2Id = d.data.rels.parents[1]
    return !mainParentIds.includes(sibParent1Id) && !mainParentIds.includes(sibParent2Id)
  })
  
  // Link stepsiblings to their actual parents
  // This ensures they have parents set before links are created, preventing errors
  stepsiblings.forEach(sib => {
    const sibParent1Id = sib.data.rels.parents[0]
    const sibParent2Id = sib.data.rels.parents[1]
    const sibParent1 = tree.find(d => d.data.id === sibParent1Id)
    const sibParent2 = tree.find(d => d.data.id === sibParent2Id)
    
    // Ensure parents array exists and is populated
    if (!sib.parents) sib.parents = []
    
    if (sibParent1) {
      if (!sib.parents.find(p => p.data.id === sibParent1Id)) {
        sib.parents.push(sibParent1)
      }
      if (!sibParent1.children) sibParent1.children = []
      if (!sibParent1.children.find(c => c.data.id === sib.data.id)) {
        sibParent1.children.push(sib)
      }
      if (!sib.parent) sib.parent = sibParent1
    }
    if (sibParent2) {
      if (!sib.parents.find(p => p.data.id === sibParent2Id)) {
        sib.parents.push(sibParent2)
      }
      if (!sibParent2.children) sibParent2.children = []
      if (!sibParent2.children.find(c => c.data.id === sib.data.id)) {
        sibParent2.children.push(sib)
      }
      if (!sib.parent) sib.parent = sibParent2
    }
    
    // If no parents were found, ensure parents array is at least not empty when it shouldn't be
    // This prevents link creation errors for stepsiblings without parents in the tree
    if (sib.parents.length === 0 && (sibParent1Id || sibParent2Id)) {
      // Parents exist in data but not in tree - this is okay, just ensure array exists
      // The link creation will handle this gracefully with the original check
    }
  })
  
  // Also ensure that any nodes with empty parents arrays that shouldn't have them
  // are handled properly. This is a safety measure to prevent link creation errors.
  tree.forEach(d => {
    // If a node has parents in data but empty parents array in tree, and it's not a stepsibling,
    // we should ensure the parents are set if they exist in the tree
    if (d.data && d.data.rels && d.data.rels.parents && d.data.rels.parents.length > 0) {
      if (!d.parents || d.parents.length === 0) {
        // Try to find parents in tree
        const parent1Id = d.data.rels.parents[0]
        const parent2Id = d.data.rels.parents[1]
        const parent1 = tree.find(p => p.data.id === parent1Id)
        const parent2 = tree.find(p => p.data.id === parent2Id)
        
        if (parent1 || parent2) {
          if (!d.parents) d.parents = []
          if (parent1 && !d.parents.find(p => p.data.id === parent1Id)) {
            d.parents.push(parent1)
          }
          if (parent2 && !d.parents.find(p => p.data.id === parent2Id)) {
            d.parents.push(parent2)
          }
        }
      }
    }
  })
}

/**
 * Main extension function that applies all tree extensions
 * Call this after the tree is calculated but before it's used for rendering
 */
export function extendTree(
  treeResult,
  options = {}
) {
  const { node_separation = 250, one_level_rels = false, show_siblings_of_main = false } = options
  
  // 1. Add spouses for ancestry nodes
  extendSpousesForAncestryNodes(
    treeResult.data,
    treeResult.data_stash,
    node_separation,
    one_level_rels
  )
  
  // 2. If siblings are shown, extend stepsibling parent links
  if (show_siblings_of_main) {
    const main = treeResult.data.find(d => d.data.main)
    if (main) {
      extendStepsiblingParentLinks(treeResult.data, main)
    }
  }
  
  return treeResult
}

