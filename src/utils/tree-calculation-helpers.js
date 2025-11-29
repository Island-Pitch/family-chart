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

