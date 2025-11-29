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
    
    // CRITICAL: Filter spouses to only include those who are parents in the direct lineage
    // Only show spouses who are also parents of nodes already in the tree (direct lineage)
    spouses = spouses.filter(sp_id => {
      // Check if this spouse is a parent of any node already in the tree
      const isParentInTree = tree.some(node => {
        const nodeParents = node.data?.rels?.parents || []
        return nodeParents.includes(sp_id)
      })
      return isParentInTree
    })
    
    if (spouses.length > 0) {
      if (one_level_rels && d.depth > 0) continue
      const side = d.data.data.gender === "M" ? -1 : 1;  // female on right
      
      // First pass: collect all spouses (existing and new)
      const spouseNodes = []
      const newSpouses = []
      
      spouses.forEach((sp_id, i) => {
        // Check if spouse is already in tree
        const existingSpouse = tree.find(t => t.data.id === sp_id)
        if (existingSpouse) {
          // CRITICAL: If this spouse is already in the tree as an ancestry node (parent),
          // we should NOT add it again as a spouse. Just link them as coparents if needed.
          // This prevents duplicate nodes (e.g., Alfred Sr. appearing both as grandfather and as Elena's spouse)
          // Check both is_ancestry flag and if it's in the parents hierarchy
          const isAncestryNode = existingSpouse.is_ancestry === true
          
          // Check if sp_id is a parent of the current node
          const isParentOfCurrentNode = d.data?.rels?.parents?.includes(sp_id)
          
          // Check if sp_id is a parent of any of the current node's children
          const isParentOfChildren = (d.data?.rels?.children || []).some(childId => {
            const childNode = tree.find(t => t.data.id === childId)
            if (!childNode) return false
            const childParents = childNode.data?.rels?.parents || []
            return childParents.includes(sp_id)
          })
          
          // Check if sp_id is a parent of any descendant in the tree hierarchy
          const isParentInHierarchy = (() => {
            // Check if existingSpouse is a parent of d in the tree structure
            if (d.parents && d.parents.some(p => p.data.id === sp_id)) {
              return true
            }
            // Check if existingSpouse is a parent of any of d's children in the tree
            if (d.children) {
              return d.children.some(child => {
                return child.parents && child.parents.some(p => p.data.id === sp_id)
              })
            }
            return false
          })()
          
          const isInParentsHierarchy = isParentOfCurrentNode || isParentOfChildren || isParentInHierarchy
          
          if (isAncestryNode || isInParentsHierarchy) {
            // Already in tree as a parent - DO NOT link as coparent if they're already connected via parent-child relationship
            // This prevents creating diagonal lines when they should be connected via vertical parent-child lines
            console.log(`[extendSpousesForAncestryNodes] Skipping duplicate spouse ${sp_id} for ${d.data.id} - already in tree as ancestry/parent (isAncestry=${isAncestryNode}, isParentOfCurrent=${isParentOfCurrentNode}, isParentOfChildren=${isParentOfChildren}, isParentInHierarchy=${isParentInHierarchy})`)
            // Only set coparent if they're NOT already connected via parent-child relationship
            // If they're both parents of the same child, they'll be connected via the parent-child link, not coparent
            const areBothParentsOfSameChild = isParentOfChildren || isParentInHierarchy
            if (!areBothParentsOfSameChild && d.is_ancestry && !d.coparent) {
              d.coparent = existingSpouse
            }
            if (!areBothParentsOfSameChild && !existingSpouse.coparent) {
              existingSpouse.coparent = d
            }
            // DO NOT add to spouses array if they're already a parent - this prevents showing them as spouse/sibling
            return // Skip - don't add to spouseNodes or newSpouses, and don't add to spouses array
          }
          
          // Verify this is actually a spouse relationship, not a sibling or child
          const foundNodeSpouses = existingSpouse.data?.rels?.spouses || []
          const foundNodeChildren = existingSpouse.data?.rels?.children || []
          const foundNodeSiblings = existingSpouse.data?.rels?.siblings || []
          const currentNodeId = d.data.id
          
          const isActuallySpouse = foundNodeSpouses.includes(currentNodeId)
          const isSibling = foundNodeSiblings.includes(currentNodeId)
          const isChild = foundNodeChildren.includes(currentNodeId)
          
          // Only add if it's actually a spouse, not a sibling or child
          if (isActuallySpouse && !isSibling && !isChild) {
            // Not a parent, so add to spouseNodes for positioning
            spouseNodes.push(existingSpouse)
          } else {
            // This is NOT a spouse - it's a sibling or child, so don't add it
            console.warn(`[extendSpousesForAncestryNodes] Skipping ${sp_id} for ${d.data.id} - it's a ${isSibling ? 'sibling' : isChild ? 'child' : 'non-spouse'}, not a spouse`)
          }
        } else {
          // Double-check the node isn't already in the tree (defensive check)
          const alreadyInTree = tree.find(t => t.data.id === sp_id)
          if (alreadyInTree) {
            // Node is already in tree but wasn't found in first check - this shouldn't happen
            // but if it does, link it as coparent if it's a parent
            const currentNodeParents = d.data?.rels?.parents || []
            const isAlreadyParent = currentNodeParents.includes(sp_id)
            if (isAlreadyParent) {
              if (d.is_ancestry && !d.coparent) {
                d.coparent = alreadyInTree
              }
              if (alreadyInTree.is_ancestry && !alreadyInTree.coparent) {
                alreadyInTree.coparent = d
              }
            }
            console.warn(`[extendSpousesForAncestryNodes] Node ${sp_id} already in tree for ${d.data.id}, skipping duplicate add`)
            return // Skip adding as new spouse
          }
          
          const spouseData = data_stash.find(d0 => d0.id === sp_id)
          if (spouseData) {
            // Validate the spouse data also has the reciprocal relationship
            const spouseSpouses = spouseData.rels?.spouses || []
            if (spouseSpouses.includes(d.data.id)) {
              // CRITICAL: Check if this spouse is already a parent (of current node or its children) - if so, don't add as new spouse
              const currentNodeParents = d.data?.rels?.parents || []
              const currentNodeChildren = d.data?.rels?.children || []
              const isAlreadyParent = currentNodeParents.includes(sp_id)
              // Check if this spouse is already a parent of any of the current node's children
              const isParentOfChildren = currentNodeChildren.some(childId => {
                const childNode = tree.find(t => t.data.id === childId)
                if (!childNode) return false
                const childParents = childNode.data?.rels?.parents || []
                return childParents.includes(sp_id)
              })
              if (isAlreadyParent || isParentOfChildren) {
                // Already a parent, just link as coparent (will be handled elsewhere)
                console.warn(`[extendSpousesForAncestryNodes] Skipping ${sp_id} for ${d.data.id} - already a parent (of current node or its children), should not be added as new spouse`)
              } else {
                newSpouses.push({ data: spouseData, index: i })
              }
            } else {
              console.warn(`[extendSpousesForAncestryNodes] Skipping ${sp_id} for ${d.data.id} - missing reciprocal spouse relationship`)
            }
          }
        }
      })
      
      // Position existing spouses relative to each other and Elena
      if (spouseNodes.length > 0) {
        // Sort existing spouses by their current x position
        spouseNodes.sort((a, b) => a.x - b.x)
        
        // Calculate center position for all spouses
        const totalSpouses = spouseNodes.length + newSpouses.length
        const centerOffset = (totalSpouses - 1) / 2 * node_separation * side
        
        // Position existing spouses evenly around Elena
        spouseNodes.forEach((spouse, idx) => {
          // Link spouse to Elena
          if (!d.spouses) d.spouses = []
          if (!d.spouses.includes(spouse)) {
            d.spouses.push(spouse)
          }
          
          // Position spouse relative to Elena
          const spouseOffset = (idx - (spouseNodes.length - 1) / 2) * node_separation * side
          spouse.x = d.x + spouseOffset
          
          // Set coparent relationship
          if (d.is_ancestry && !d.coparent && idx === 0) {
            d.coparent = spouse
          }
          if (spouse.is_ancestry && !spouse.coparent) {
            spouse.coparent = d
          }
        })
        
        // Adjust Elena's position to center all spouses
        d.x += centerOffset
      }
      
      // Second pass: add new spouses (not already in tree)
      newSpouses.forEach(({ data: spouseData, index: i }) => {
        const spouse = {
          data: spouseData,
          added: true,
          depth: d.depth,
          spouse: d,
          x: d.x - (node_separation * (spouseNodes.length + i + 1)) * side,
          y: d.y,
          tid: `${d.data.id}-spouse-${spouseNodes.length + i}`,
          is_ancestry: d.is_ancestry, // Spouse of ancestry node is also ancestry
        }
        spouse.sx = spouse.x + (node_separation/2)*side
        spouse.sy = spouse.y
        if (!d.spouses) d.spouses = []
        d.spouses.push(spouse)
        tree.push(spouse)
        
        // Set coparent relationship for ancestry nodes
        if (d.is_ancestry && !d.coparent) {
          d.coparent = spouse
          spouse.coparent = d
        }
      })
      
      // Ensure minimum spacing between spouses with different children
      if (d.spouses && d.spouses.length > 1) {
        for (let j = 0; j < d.spouses.length; j++) {
          for (let k = j + 1; k < d.spouses.length; k++) {
            const spouseA = d.spouses[j]
            const spouseB = d.spouses[k]
            if (spouseA.is_ancestry && spouseB.is_ancestry && 
                spouseA.depth === spouseB.depth) {
              const childrenA = spouseA.data?.rels?.children || [];
              const childrenB = spouseB.data?.rels?.children || [];
              const hasDifferentChildren = !childrenA.some(id => childrenB.includes(id));
              if (hasDifferentChildren) {
                const minSpacing = node_separation * 1.5;
                const currentDistance = Math.abs(spouseB.x - spouseA.x);
                if (currentDistance < minSpacing) {
                  const direction = spouseA.x < spouseB.x ? -1 : 1;
                  const adjustment = (minSpacing - currentDistance) / 2;
                  spouseA.x -= adjustment * direction;
                  spouseB.x += adjustment * direction;
                }
              }
            }
          }
        }
      }
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
 * Remove duplicate nodes from the tree
 * If a person appears multiple times, keep the one in the main hierarchy (not added as spouse)
 */
export function removeDuplicateNodes(tree) {
  const nodeMap = new Map() // Map of id -> array of nodes with that id
  
  // First pass: collect all nodes by id
  tree.forEach((node, index) => {
    const nodeId = node.data?.id
    if (!nodeId) return
    
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, [])
    }
    nodeMap.get(nodeId).push({ node, index })
  })
  
  // Second pass: for each duplicate, keep the one NOT added as spouse, remove others
  const nodesToRemove = []
  
  nodeMap.forEach((nodesWithId, nodeId) => {
    if (nodesWithId.length <= 1) return // No duplicates
    
    // Find the node that's NOT added (in main hierarchy)
    const mainNode = nodesWithId.find(({ node }) => !node.added)
    const nodeToKeep = mainNode || nodesWithId[0] // Fallback to first if all are added
    
    // Mark all others for removal
    nodesWithId.forEach(({ node, index }) => {
      if (node !== nodeToKeep.node) {
        nodesToRemove.push({ node, index, nodeId })
        console.log(`[removeDuplicateNodes] Marking duplicate ${nodeId} at index ${index} for removal (added=${node.added}, keeping one at index ${nodeToKeep.index})`)
      }
    })
  })
  
  // Third pass: remove duplicates (in reverse order to maintain indices)
  nodesToRemove.sort((a, b) => b.index - a.index) // Sort descending by index
  nodesToRemove.forEach(({ node, index, nodeId }) => {
    // Remove from tree array
    tree.splice(index, 1)
    
    // Also remove from any spouse arrays
    tree.forEach(d => {
      if (d.spouses) {
        const spouseIndex = d.spouses.findIndex(s => s.data?.id === nodeId)
        if (spouseIndex >= 0) {
          d.spouses.splice(spouseIndex, 1)
        }
      }
    })
  })
  
  if (nodesToRemove.length > 0) {
    console.log(`[removeDuplicateNodes] Removed ${nodesToRemove.length} duplicate nodes`)
  }
  
  return tree
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
  
  // 2. Remove any duplicate nodes that were created
  removeDuplicateNodes(treeResult.data)
  
  // Removed stepsibling parent links extension - using base behavior only
  
  return treeResult
}

