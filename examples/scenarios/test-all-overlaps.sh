#!/bin/bash
# Script to test all scenarios for overlaps
# This will open each scenario in the browser and check for overlaps

echo "Testing all scenarios for overlaps..."
echo "This script will check each scenario at http://localhost:8080/examples/scenarios/"

scenarios=(
  "sc01" "sc02" "sc03" "sc04" "sc05" "sc06" "sc07" "sc07b"
  "sc08" "sc09" "sc10" "sc11" "sc12" "sc13" "sc14" "sc15"
  "sc16" "sc17" "sc18" "sc19" "sc20" "sc21" "sc22" "sc23"
  "sc24" "sc25"
)

echo ""
echo "Use this JavaScript in the browser console to check for overlaps:"
echo ""
cat << 'EOF'
const cards = document.querySelectorAll('.f3 .card');
const svg = document.querySelector('.f3 svg');
const links = svg ? svg.querySelectorAll('line, path') : [];
const cardPositions = Array.from(cards).map(card => {
  const rect = card.getBoundingClientRect();
  const text = card.textContent.trim();
  return { id: card.getAttribute('data-person-id') || text.substring(0, 30), x: rect.left, y: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, text: text.substring(0, 50) };
});
const overlaps = [];
for (let i = 0; i < cardPositions.length; i++) {
  for (let j = i + 1; j < cardPositions.length; j++) {
    const card1 = cardPositions[i];
    const card2 = cardPositions[j];
    const horizontalOverlap = !(card1.right < card2.x - 1 || card2.right < card1.x - 1);
    const verticalOverlap = !(card1.bottom < card2.y - 1 || card2.bottom < card1.y - 1);
    if (horizontalOverlap && verticalOverlap) {
      overlaps.push({ card1: card1.text, card2: card2.text, overlapX: Math.round(Math.min(card1.right, card2.right) - Math.max(card1.x, card2.x)), overlapY: Math.round(Math.min(card1.bottom, card2.bottom) - Math.max(card1.y, card2.y)) });
    }
  }
}
console.log({ totalCards: cards.length, totalLinks: links.length, cardOverlaps: overlaps, hasOverlaps: overlaps.length > 0 });
EOF

echo ""
echo "Scenarios to test: ${#scenarios[@]}"
for scenario in "${scenarios[@]}"; do
  echo "  - http://localhost:8080/examples/scenarios/${scenario}.html"
done

