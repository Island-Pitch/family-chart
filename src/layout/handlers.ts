import * as d3 from "d3"
import { TreeDatum } from "../types/treeData"
import { Data, Datum } from "../types/data"
import { CalculateTreeOptions } from "./calculate-tree"
import { preventSiblingOverlaps } from "../utils/tree-calculation-helpers"
import { defaultSortByAge, defaultSortPartnersByRecency } from "../utils/family-chart-utils"

export function sortChildrenWithSpouses(children: Datum[], datum: Datum, data: Data) {
  if (!datum.rels.children) return
  const spouses = datum.rels.spouses || []
  
  // Sort spouses using the SAME sorting function as setupSpouses in calculate-tree.ts
  // REGULAR recency: newest relationships at index 0 (closest to person)
  // Oldest relationships at highest index (farthest from person)
  const relationshipStatuses = datum.data?.relationshipStatuses || datum.data?.data?.relationshipStatuses || {};
  const sortedSpouses = [...spouses].sort((a, b) => {
    return defaultSortPartnersByRecency(a, b, relationshipStatuses);
  });
  
  // Children are sorted left-to-right by their biological parent's position:
  // - Index 0 spouse = newest relationship = closest to person
  // - Index N spouse = oldest relationship = farthest from person
  // 
  // For FEMALE main person: spouses are positioned to the LEFT (decreasing x)
  //   Index 0 spouse → closest to person (rightmost spouse position)
  //   Index N spouse → farthest from person (leftmost spouse position)
  //   Children of oldest spouse (highest index) should be LEFTMOST
  //   So: sort DESCENDING by index (higher index = leftmost)
  // 
  // For MALE main person: spouses are positioned to the RIGHT (increasing x)
  //   Index 0 spouse → closest to person (leftmost spouse position)
  //   Index N spouse → farthest from person (rightmost spouse position)
  //   Children of oldest spouse (highest index) should be RIGHTMOST
  //   So: sort ASCENDING by index (lower index = leftmost)
  
  return children.sort((a, b) => {
    const a_p2 = otherParent(a, datum, data)
    const b_p2 = otherParent(b, datum, data)
    const a_i = a_p2 ? sortedSpouses.indexOf(a_p2.id) : -1
    const b_i = b_p2 ? sortedSpouses.indexOf(b_p2.id) : -1

    // Children with no other parent (single parent) go to the end
    if (a_i === -1 && b_i !== -1) return 1
    if (a_i !== -1 && b_i === -1) return -1
    
    // For female: higher index = leftmost (descending sort)
    // For male: lower index = leftmost (ascending sort)
    if (datum.data.gender === "M") return a_i - b_i
    else return b_i - a_i
  })
}

export function sortAddNewChildren(children: Datum[]) {
  return children.sort((a, b) => {
    const a_new = a._new_rel_data
    const b_new = b._new_rel_data
    if (a_new && !b_new) return 1
    if (!a_new && b_new) return -1
    return 0
  })
}

function otherParent(d: Datum, p1: Datum, data: Data) {
  return data.find(d0 => (d0.id !== p1.id) && (d.rels.parents.includes(d0.id)))
}

export function calculateEnterAndExitPositions(d: TreeDatum, entering: boolean, exiting: boolean) {
  d.exiting = exiting
  if (entering) {
    if (d.depth === 0 && !d.spouse) {d._x = d.x; d._y = d.y}
    else if (d.spouse) {d._x = d.spouse.x; d._y = d.spouse.y;}
    else if (d.is_ancestry) {
      if (!d.parent) throw new Error('no parent')
      d._x = d.parent.x; d._y = d.parent.y;
    }
    else {d._x = d.psx; d._y = d.psy;}
  } else if (exiting) {
    const x = d.x > 0 ? 1 : -1,
      y = d.y > 0 ? 1 : -1
    {d._x = d.x+400*x; d._y = d.y+400*y;}
  }
}


export function handlePrivateCards({
  tree,
  data_stash,
  private_cards_config
}: {
  tree: TreeDatum[],
  data_stash: Data,
  private_cards_config: {
    condition: (d: Datum) => boolean;
  }
}) {
  const private_persons: Record<Datum['id'], boolean> = {}
  const condition = private_cards_config.condition
  if (!condition) return console.error('private_cards_config.condition is not set')
  tree.forEach(d => {
    if (d.data._new_rel_data) return
    const is_private = isPrivate(d.data.id)
    if (is_private) d.is_private = is_private
    return
  })

  function isPrivate(d_id: Datum['id']) {
    const parents_and_spouses_checked: Datum['id'][] = []
    let is_private = false
    checkParentsAndSpouses(d_id)
    private_persons[d_id] = is_private
    return is_private

    function checkParentsAndSpouses(d_id: Datum['id']) {
      if (is_private) return
      if (private_persons.hasOwnProperty(d_id)) {
        is_private = private_persons[d_id]
        return is_private
      }
      const d = data_stash.find(d0 => d0.id === d_id)
      if (!d) throw new Error('no d')
      if (d._new_rel_data) return
      if (condition(d)) {
        is_private = true
        return true
      }

      const rels = d.rels;
      [...rels.parents, ...(rels.spouses || [])].forEach(d0_id => {
        if (!d0_id) return
        if (parents_and_spouses_checked.includes(d0_id)) return
        parents_and_spouses_checked.push(d0_id)
        checkParentsAndSpouses(d0_id)
      })
    }
  }
}

export function getMaxDepth(d_id: Datum['id'], data_stash: Data) {
  const datum = data_stash.find(d => d.id === d_id)
  if (!datum) throw new Error('no datum')
  const root_ancestry = d3.hierarchy(datum, d => hierarchyGetterParents(d) as Iterable<Datum>)
  const root_progeny = d3.hierarchy(datum, d => hierarchyGetterChildren(d) as Iterable<Datum>)

  return {
    ancestry: root_ancestry.height,
    progeny: root_progeny.height
  }


  function hierarchyGetterChildren(d: Datum) {
    return [...(d.rels.children || [])]
      .map(id => data_stash.find(d => d.id === id))
      .filter(d => d && !d._new_rel_data && !d.to_add)
  }

  function hierarchyGetterParents(d: Datum) {
    return d.rels.parents
      .filter(d => d)
      .map(id => data_stash.find(d => d.id === id))
      .filter(d => d && !d._new_rel_data && !d.to_add)
  }
}

export function setupSiblings({
  tree, data_stash, node_separation, sortChildrenFunction
}: {
  tree: TreeDatum[],
  data_stash: Data,
  node_separation: number,
  sortChildrenFunction: CalculateTreeOptions['sortChildrenFunction']
}) {
  const main = tree.find(d => d.data.main)
  if (!main) throw new Error('no main')
  const p1 = main.data.rels.parents[0]
  const p2 = main.data.rels.parents[1]

  const siblings = findSiblings(main)
  if (siblings.length > 0 && !main.parents) throw new Error('no parents')
  const siblings_added = addSiblingsToTree(main)
  positionSiblings(main)
  setSiblingDropPoints(main, siblings_added, node_separation)


  function findSiblings(main: TreeDatum) {
    return data_stash.filter(d => {
      if (d.id === main.data.id) return false
      if (p1 && d.rels.parents.includes(p1)) return true
      if (p2 && d.rels.parents.includes(p2)) return true
      return false
    }) 
  }


  function addSiblingsToTree(main: TreeDatum) {
    const siblings_added = []

    for (let i = 0; i < siblings.length; i++) {
      const sib: TreeDatum = {
        data: siblings[i],
        sibling: true,
        x: 0.0,  // to be calculated in positionSiblings
        y: main.y,
        depth: main.depth-1,
        parents: []
      }

      const p1 = main.parents!.find(d => d.data.id === sib.data.rels.parents[0])
      const p2 = main.parents!.find(d => d.data.id === sib.data.rels.parents[1])
      if (p1) sib.parents!.push(p1)
      if (p2) sib.parents!.push(p2)
      
      // Store the sibling's actual parent IDs for later use in link positioning
      sib._siblingParentIds = sib.data.rels.parents
      
      tree.push(sib)
      siblings_added.push(sib)  
    }

    return siblings_added
  }

  function positionSiblings(main: TreeDatum) {
    const sorted_siblings = [main, ...siblings_added]
    if (sortChildrenFunction) sorted_siblings.sort((a: TreeDatum, b: TreeDatum) => sortChildrenFunction(a.data, b.data))  // first sort by custom function if provided

    // Determine which parent is on the left vs right based on their X positions in the tree
    // This is crucial for the left-center-right rule: children with only the left parent go left,
    // children with both parents go center, children with only the right parent go right
    const leftParent = main.parents && main.parents.length >= 2 
      ? (main.parents[0].x < main.parents[1].x ? main.parents[0] : main.parents[1])
      : (main.parents && main.parents.length === 1 ? main.parents[0] : null);
    const rightParent = main.parents && main.parents.length >= 2
      ? (main.parents[0].x < main.parents[1].x ? main.parents[1] : main.parents[0])
      : null;
    
    const leftParentId = leftParent?.data.id;
    const rightParentId = rightParent?.data.id;

    sorted_siblings.sort((a: TreeDatum, b: TreeDatum) => {
      // Get the parents each sibling has (that are in the tree)
      const a_parents = a.data.rels.parents.filter(pId => 
        main.parents!.some(p => p.data.id === pId)
      );
      const b_parents = b.data.rels.parents.filter(pId => 
        main.parents!.some(p => p.data.id === pId)
      );
      
      const a_hasBoth = a_parents.length === 2 || (a_parents.includes(leftParentId!) && a_parents.includes(rightParentId!));
      const b_hasBoth = b_parents.length === 2 || (b_parents.includes(leftParentId!) && b_parents.includes(rightParentId!));
      const a_hasOnlyLeft = a_parents.length === 1 && a_parents.includes(leftParentId!);
      const b_hasOnlyLeft = b_parents.length === 1 && b_parents.includes(leftParentId!);
      const a_hasOnlyRight = a_parents.length === 1 && a_parents.includes(rightParentId!);
      const b_hasOnlyRight = b_parents.length === 1 && b_parents.includes(rightParentId!);
      
      // Left-center-right rule:
      // - Children with only left parent go LEFT (sort first)
      // - Children with both parents go CENTER (sort middle)
      // - Children with only right parent go RIGHT (sort last)
      
      // a has only left parent
      if (a_hasOnlyLeft && !b_hasOnlyLeft) return -1;
      if (!a_hasOnlyLeft && b_hasOnlyLeft) return 1;
      
      // a has only right parent
      if (a_hasOnlyRight && !b_hasOnlyRight) return 1;
      if (!a_hasOnlyRight && b_hasOnlyRight) return -1;
      
      // Both have same parent configuration, maintain original order
      return 0
    })

    const main_x = main.x
    const spouses_x = (main.spouses || []).map(d => d.x)
    const x_range = d3.extent([main_x, ...spouses_x])

    const main_sorted_index = sorted_siblings.findIndex(d => d.data.id === main.data.id)
    
    // Check if there are multiple sibling groups (siblings with different parent pairs)
    // If so, use the overlap prevention function from utils to position all siblings on the same side
    const parentPairGroups = new Map<string, TreeDatum[]>()
    sorted_siblings.forEach((sib, idx) => {
      if (idx === main_sorted_index) return
      const parentIds = sib.data?.rels?.parents || []
      if (parentIds.length === 0) return
      const pairKey = [...parentIds].sort().join('-')
      if (!parentPairGroups.has(pairKey)) {
        parentPairGroups.set(pairKey, [])
      }
      parentPairGroups.get(pairKey)!.push(sib)
    })
    
    // Sort siblings WITHIN each parent pair group by age (oldest leftmost)
    parentPairGroups.forEach((siblings, pairKey) => {
      siblings.sort((a: TreeDatum, b: TreeDatum) => {
        // First apply custom sort function if provided
        if (sortChildrenFunction) {
          const customResult = sortChildrenFunction(a.data, b.data);
          if (customResult !== 0) return customResult;
        }
        // Then apply default age-based sort
        return defaultSortByAge(a, b);
      });
    });
    
    // If multiple groups exist, use overlap prevention from utils
    if (parentPairGroups.size > 1) {
      preventSiblingOverlaps(sorted_siblings, main, node_separation, x_range, main_sorted_index)
    } else {
      // Single group - use original positioning logic
      for (let i = 0; i < sorted_siblings.length; i++) {
        if (i === main_sorted_index) continue
        const sib = sorted_siblings[i]
        if (i < main_sorted_index) {
          sib.x = (x_range[0] ?? 0) - node_separation*(main_sorted_index - i)
        } else {
          sib.x = (x_range[1] ?? 0) + node_separation*(i - main_sorted_index)
        }
      }
    }
  }

  /**
   * Set drop points (psx) for sibling groups so each group has its own link drop point.
   * This prevents link collisions when siblings have different parent pairs.
   * 
   * For siblings with only ONE parent in the tree (step-siblings), their link goes
   * to that parent. Without separate drop points, all step-sibling groups would
   * share the same link horizontal bar, causing overlaps.
   * 
   * Solution: Calculate a drop point for each sibling group based on the group's
   * center position. This creates separate horizontal link segments for each group.
   */
  function setSiblingDropPoints(main: TreeDatum, siblings_added: TreeDatum[], node_separation: number) {
    if (siblings_added.length === 0) return
    if (!main.parents || main.parents.length === 0) return

    // Group siblings by their parent pair (using actual parent IDs, not just tree parents)
    const siblingGroups = new Map<string, TreeDatum[]>()
    
    siblings_added.forEach(sib => {
      const parentIds = sib._siblingParentIds || sib.data?.rels?.parents || []
      const pairKey = [...parentIds].sort().join('-')
      
      if (!siblingGroups.has(pairKey)) {
        siblingGroups.set(pairKey, [])
      }
      siblingGroups.get(pairKey)!.push(sib)
    })

    // If only one group, no need for separate drop points
    if (siblingGroups.size <= 1) return

    // For each sibling group, calculate the drop point based on group center
    siblingGroups.forEach((groupSiblings, pairKey) => {
      // Calculate the center X of this group
      const groupXs = groupSiblings.map(s => s.x)
      const groupMinX = Math.min(...groupXs)
      const groupMaxX = Math.max(...groupXs)
      const groupCenterX = (groupMinX + groupMaxX) / 2

      // Set psx for each sibling in this group to the group's center
      // This creates a single drop point for the entire group
      groupSiblings.forEach(sib => {
        // Only set psx if the sibling has exactly one parent in the tree
        // (step-siblings who link to a single parent)
        if (sib.parents && sib.parents.length === 1) {
          sib.psx = groupCenterX
          sib.psy = sib.parents[0].y  // Use parent's y position
        }
      })
    })
  }
}