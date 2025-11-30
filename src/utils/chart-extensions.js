import { extendTree } from "./tree-extensions.js"

/**
 * Extends a Chart instance to apply tree extensions after tree calculation
 * This ensures spouses of ancestry nodes are shown and stepsiblings are properly linked
 * 
 * This function hooks into the store's updateTree method to extend the tree
 * after it's calculated but before it's used for rendering.
 */
export function extendChart(chart) {
  // Hook into the Chart's beforeUpdate to extend the tree before it's rendered
  // This ensures the extended tree is used for rendering
  const originalBeforeUpdate = chart.beforeUpdate
  
  chart.beforeUpdate = function(props) {
    // Get the tree from the store (it was just calculated)
    const tree = chart.store.getTree()
    if (tree && !tree._extended) {
      // Extend the tree with our customizations
      extendTree(tree, {
        node_separation: chart.store.state.node_separation || 250,
        level_separation: chart.store.state.level_separation || 150,
        one_level_rels: chart.store.state.one_level_rels || false,
        show_siblings_of_main: chart.store.state.show_siblings_of_main || false,
      })
      
      // Mark as extended to avoid re-extending
      tree._extended = true
    }
    
    // Call original beforeUpdate if it exists
    if (originalBeforeUpdate) originalBeforeUpdate.call(this, props)
  }
  
  return chart
}

/**
 * Alternative approach: Use the afterUpdate hook to extend the tree
 * This is called after the tree is rendered, so we need to trigger a re-render
 */
export function extendChartWithAfterUpdate(chart) {
  const originalAfterUpdate = chart.afterUpdate
  
  chart.afterUpdate = function(props) {
    // Get the tree from the store
    const tree = chart.store.getTree()
    if (!tree) {
      if (originalAfterUpdate) originalAfterUpdate.call(this, props)
      return
    }
    
    // Extend the tree with our customizations
    const extendedTree = extendTree(tree, {
      node_separation: chart.store.state.node_separation || 250,
      one_level_rels: chart.store.state.one_level_rels || false,
      show_siblings_of_main: chart.store.state.show_siblings_of_main || false,
    })
    
    // Update the store with the extended tree
    chart.store.state.tree = extendedTree
    
    // Re-render with the extended tree
    chart.updateTree({ ...props, initial: false })
    
    // Call original afterUpdate if it exists
    if (originalAfterUpdate) originalAfterUpdate.call(this, props)
  }
  
  return chart
}

