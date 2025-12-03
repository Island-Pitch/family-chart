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
      
      tree.push(sib)
      siblings_added.push(sib)  
    }

    return siblings_added
  }

  /**
   * Position siblings based on their drop points (parent pairs).
   * 
   * COMPREHENSIVE SIBLING POSITIONING ALGORITHM:
   * 
   * 1. Group siblings by their "drop point" - the X coordinate where their link
   *    connects to the parent level. This is determined by which parent(s) they have:
   *    - Both visible parents → drop at center between parents
   *    - Only left parent → drop at left parent's X
   *    - Only right parent → drop at right parent's X
   * 
   * 2. Sort groups by drop point X (left to right)
   * 
   * 3. Position groups based on count:
   *    - 1 group: CENTER (normal distribution around main)
   *    - 2 groups: LEFT-RIGHT justification
   *    - 3+ groups: LEFT-CENTER-RIGHT distribution
   * 
   * 4. Main person stays at their current position; their group positions around them
   */
  function positionSiblings(main: TreeDatum) {
    const sorted_siblings = [main, ...siblings_added]
    if (sortChildrenFunction) sorted_siblings.sort((a: TreeDatum, b: TreeDatum) => sortChildrenFunction(a.data, b.data))

    const main_x = main.x
    const spouses_x = (main.spouses || []).map(d => d.x)
    const main_x_range = d3.extent([main_x, ...spouses_x])

    // Get visible parent positions
    const visibleParents = main.parents || [];
    const parentXs = visibleParents.map(p => p.x).sort((a, b) => a - b);
    const leftParentX = parentXs[0] ?? main_x;
    const rightParentX = parentXs[parentXs.length - 1] ?? main_x;
    const parentsCenterX = (leftParentX + rightParentX) / 2;

    // Helper to get a sibling's drop point X
    const getDropPointX = (sib: TreeDatum): number => {
      const sibParentIds = sib.data?.rels?.parents || [];
      
      // Find which visible parents this sibling has
      const sibVisibleParents = visibleParents.filter(p => sibParentIds.includes(p.data.id));
      
      if (sibVisibleParents.length === 0) {
        // No visible parents - shouldn't happen, but fallback to center
        return parentsCenterX;
      } else if (sibVisibleParents.length === 1) {
        // One visible parent - drop at that parent's X
        return sibVisibleParents[0].x;
      } else {
        // Multiple visible parents - drop at their midpoint
        const xs = sibVisibleParents.map(p => p.x);
        return (Math.min(...xs) + Math.max(...xs)) / 2;
      }
    };

    // Group siblings by their drop point X (rounded to avoid float issues)
    const dropPointGroups = new Map<number, TreeDatum[]>();
    sorted_siblings.forEach(sib => {
      const dropX = Math.round(getDropPointX(sib));
      if (!dropPointGroups.has(dropX)) {
        dropPointGroups.set(dropX, []);
      }
      dropPointGroups.get(dropX)!.push(sib);
    });

    // Get unique drop points sorted left to right
    const uniqueDropPoints = Array.from(dropPointGroups.keys()).sort((a, b) => a - b);
    const numGroups = uniqueDropPoints.length;

    // Find which group contains the main person
    const mainDropPointX = Math.round(getDropPointX(main));
    const mainGroupIndex = uniqueDropPoints.indexOf(mainDropPointX);

    // CASE 1: Single drop point - all siblings share same parent pair
    if (numGroups === 1) {
      const main_sorted_index = sorted_siblings.findIndex(d => d.data.id === main.data.id);
      for (let i = 0; i < sorted_siblings.length; i++) {
        if (i === main_sorted_index) continue;
        const sib = sorted_siblings[i];
        if (i < main_sorted_index) {
          sib.x = (main_x_range[0] ?? main_x) - node_separation * (main_sorted_index - i);
        } else {
          sib.x = (main_x_range[1] ?? main_x) + node_separation * (i - main_sorted_index);
        }
      }
      return;
    }

    // CASE 2+: Multiple drop points - position groups by their drop point
    // Strategy: Position main's group first (around main), then position other groups
    // relative to their drop points (left groups go left, right groups go right)

    // Helper to position a group internally (spread siblings within the group)
    const positionGroupInternal = (group: TreeDatum[], anchorX: number, anchorSib?: TreeDatum) => {
      if (anchorSib) {
        // Position around the anchor sibling (main person)
        const anchorIdx = group.indexOf(anchorSib);
        group.forEach((sib, i) => {
          if (sib === anchorSib) return;
          const offset = i - anchorIdx;
          sib.x = anchorSib.x + offset * node_separation;
        });
      } else {
        // Position group centered at anchorX
        const groupWidth = (group.length - 1) * node_separation;
        const startX = anchorX - groupWidth / 2;
        group.forEach((sib, i) => {
          sib.x = startX + i * node_separation;
        });
      }
    };

    // Helper to get the X extent of a group
    const getGroupExtent = (group: TreeDatum[]): [number, number] => {
      const xs = group.map(s => s.x);
      return [Math.min(...xs), Math.max(...xs)];
    };

    // First, position main's group around main
    const mainGroup = dropPointGroups.get(mainDropPointX)!;
    positionGroupInternal(mainGroup, main_x, main);
    let [currentLeftX, currentRightX] = getGroupExtent(mainGroup);

    // Now position groups to the LEFT of main's group
    // Process from closest to main outward (right to left in uniqueDropPoints)
    for (let i = mainGroupIndex - 1; i >= 0; i--) {
      const dropX = uniqueDropPoints[i];
      const group = dropPointGroups.get(dropX)!;
      
      // Position this group to the left of currentLeftX
      const groupWidth = (group.length - 1) * node_separation;
      const groupRightX = currentLeftX - node_separation; // Gap between groups
      const groupLeftX = groupRightX - groupWidth;
      
      // Position group from left to right
      group.forEach((sib, idx) => {
        sib.x = groupLeftX + idx * node_separation;
      });
      
      currentLeftX = groupLeftX;
    }

    // Now position groups to the RIGHT of main's group
    // Process from closest to main outward (left to right in uniqueDropPoints)
    for (let i = mainGroupIndex + 1; i < numGroups; i++) {
      const dropX = uniqueDropPoints[i];
      const group = dropPointGroups.get(dropX)!;
      
      // Position this group to the right of currentRightX
      const groupLeftX = currentRightX + node_separation; // Gap between groups
      
      // Position group from left to right
      group.forEach((sib, idx) => {
        sib.x = groupLeftX + idx * node_separation;
      });
      
      const groupWidth = (group.length - 1) * node_separation;
      currentRightX = groupLeftX + groupWidth;
    }
  }
}