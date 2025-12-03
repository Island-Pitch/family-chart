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

  function positionSiblings(main: TreeDatum) {
    const sorted_siblings = [main, ...siblings_added]
    if (sortChildrenFunction) sorted_siblings.sort((a: TreeDatum, b: TreeDatum) => sortChildrenFunction(a.data, b.data))

    const main_x = main.x
    const spouses_x = (main.spouses || []).map(d => d.x)
    const x_range = d3.extent([main_x, ...spouses_x])

    // Helper to calculate drop point X for a sibling
    const getDropPointX = (sib: TreeDatum): number => {
      const sibParentIds = sib.data?.rels?.parents || [];
      const visibleSibParents = sibParentIds.filter((pId: string) => 
        main.parents?.some(p => p.data.id === pId)
      );
      
      if (main.parents && main.parents.length >= 2) {
        if (visibleSibParents.length === 2) {
          // Has both parents - drop point is center
          return (main.parents[0].x + main.parents[1].x) / 2;
        } else if (visibleSibParents.length === 1) {
          // Has only one parent - drop point is at that parent
          const sibParent = main.parents.find(p => visibleSibParents.includes(p.data.id));
          return sibParent ? sibParent.x : sib.x;
        }
      } else if (main.parents && main.parents.length === 1) {
        return main.parents[0].x;
      }
      return sib.x;
    };

    // Get main's drop point
    const mainDropPointX = getDropPointX(main);
    
    // Check if there are siblings with different drop points
    const siblingDropPoints = sorted_siblings.map(sib => ({
      sib,
      dropPointX: getDropPointX(sib)
    }));
    
    // Find if main's drop point is the leftmost, rightmost, or somewhere in between
    const allDropPointXs = siblingDropPoints.map(s => s.dropPointX);
    const minDropPointX = Math.min(...allDropPointXs);
    const maxDropPointX = Math.max(...allDropPointXs);
    
    const mainIsLeftmost = mainDropPointX <= minDropPointX;
    const mainIsRightmost = mainDropPointX >= maxDropPointX;

    // Find main person's index in the sorted siblings
    const main_sorted_index = sorted_siblings.findIndex(d => d.data.id === main.data.id)
    
    // Position siblings based on drop point relationships
    // If main's drop point is leftmost, main goes left, others to the right
    // If main's drop point is rightmost, main goes right, others to the left
    // If main's drop point is in the middle, use normal distribution
    
    if (mainIsLeftmost && !mainIsRightmost) {
      // Main's drop point is leftmost - position main on left, others to the right
      let current_x = (x_range[1] ?? main_x) + node_separation;
      for (let i = 0; i < sorted_siblings.length; i++) {
        if (i === main_sorted_index) continue;
        const sib = sorted_siblings[i];
        sib.x = current_x;
        current_x += node_separation;
      }
    } else if (mainIsRightmost && !mainIsLeftmost) {
      // Main's drop point is rightmost - position main on right, others to the left
      let current_x = (x_range[0] ?? main_x) - node_separation;
      for (let i = sorted_siblings.length - 1; i >= 0; i--) {
        if (i === main_sorted_index) continue;
        const sib = sorted_siblings[i];
        sib.x = current_x;
        current_x -= node_separation;
      }
    } else {
      // Main's drop point is center (or all same) - use normal distribution
      for (let i = 0; i < sorted_siblings.length; i++) {
        if (i === main_sorted_index) continue;
        const sib = sorted_siblings[i];
        if (i < main_sorted_index) {
          sib.x = (x_range[0] ?? 0) - node_separation * (main_sorted_index - i);
        } else {
          sib.x = (x_range[1] ?? 0) + node_separation * (i - main_sorted_index);
        }
      }
    }
  }
}