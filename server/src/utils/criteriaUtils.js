
function sortCriteriaByPriority(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return [];
  return [...criteria].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
}

module.exports = { sortCriteriaByPriority };
